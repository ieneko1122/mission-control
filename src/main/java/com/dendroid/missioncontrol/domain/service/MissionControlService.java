package com.dendroid.missioncontrol.domain.service;

import com.dendroid.missioncontrol.domain.model.*;
import com.dendroid.missioncontrol.domain.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime; // 🔥【追加】
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class MissionControlService {

    private final OperatorRepository operatorRepository;
    private final InterruptQueueRepository interruptQueueRepository;
    private final MissionLogRepository missionLogRepository;

    /**
     * 本日のオペレーションを独立したポインターで実行する
     */
    @Transactional
    public List<MissionLog> calculateDailyMissions(List<Long> presentOperatorIds) {
        log.info("[COMMAND] Executing independent assignment matrix for {} operators...", presentOperatorIds.size());

        List<Operator> allOperators = operatorRepository.findAllByOrderByDisplayOrderAsc();
        Set<Long> presents = new HashSet<>(presentOperatorIds);
        LocalDate today = LocalDate.now();
        LocalDateTime batchTime = LocalDateTime.now();
        List<MissionLog> todayLogs = new ArrayList<>();

        // 各タスク（ASSEMBLY, REPORT, FEEDBACK）を順次独立して処理
        for (MissionType type : MissionType.values()) {
            RotationPointer pointer = createPointer(allOperators, type);
            fillSlotsIndependent(type, type.getRequiredSlots(), presents, pointer, todayLogs, today, batchTime);
        }

        return missionLogRepository.saveAll(todayLogs);
    }

    /**
     * タイプごとに最後の割り当て位置を復元する
     */
    private RotationPointer createPointer(List<Operator> allOps, MissionType type) {
        int lastOrder = missionLogRepository.findFirstByMissionTypeAndIsInterruptFalseOrderByIdDesc(type)
                .map(log -> log.getOperator().getDisplayOrder())
                .orElse(0);
        return new RotationPointer(allOps, lastOrder);
    }

    /**
     * 独立したキュー処理（重複チェックなし）
     */
    private void fillSlotsIndependent(MissionType type, int slotCount, Set<Long> presents,
                                      RotationPointer pointer, List<MissionLog> todayLogs, LocalDate today,
                                      LocalDateTime batchTime) {
        int filled = 0;

        // A. 割り込みキュー（過去の欠席者）の消化
        List<InterruptQueue> queue = interruptQueueRepository.findByTargetTypeOrderByCreatedAtAsc(type);
        for (InterruptQueue interrupt : queue) {
            if (filled >= slotCount) break;
            if (presents.contains(interrupt.getOperator().getId())) {
                todayLogs.add(new MissionLog(null, today, interrupt.getOperator(), type, true, batchTime, false));
                interruptQueueRepository.delete(interrupt);
                log.info("[INTERRUPT] Operator {} recovered for {}", interrupt.getOperator().getName(), type);
                filled++;
            }
        }

        // B. 残り枠を通常ローテーションで埋める
        while (filled < slotCount) {
            Operator op = pointer.next();
            if (presents.contains(op.getId())) {
                todayLogs.add(new MissionLog(null, today, op, type, false, batchTime, false));
                filled++;
            } else {
                interruptQueueRepository.save(InterruptQueue.create(op, type));
                log.warn("[WARNING] Operator {} absent. Queueing for {}", op.getName(), type);
            }
        }
    }

    /**
     * リングバッファ構造のポインター
     */
    private static class RotationPointer {
        private final List<Operator> list;
        private int index;

        public RotationPointer(List<Operator> list, int lastDisplayOrder) {
            this.list = list;
            this.index = 0;
            for (int i = 0; i < list.size(); i++) {
                if (list.get(i).getDisplayOrder() == lastDisplayOrder) {
                    this.index = (i + 1) % list.size();
                    break;
                }
            }
        }

        public Operator next() {
            Operator op = list.get(index);
            index = (index + 1) % list.size();
            return op;
        }
    }
}