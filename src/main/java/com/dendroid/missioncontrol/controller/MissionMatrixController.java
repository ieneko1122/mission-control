package com.dendroid.missioncontrol.controller;

import com.dendroid.missioncontrol.domain.model.MissionLog;
import com.dendroid.missioncontrol.domain.model.MissionType;
import com.dendroid.missioncontrol.domain.model.Operator;
import com.dendroid.missioncontrol.domain.repository.InterruptQueueRepository;
import com.dendroid.missioncontrol.domain.repository.MissionLogRepository;
import com.dendroid.missioncontrol.domain.repository.OperatorRepository;
import com.dendroid.missioncontrol.domain.service.MissionControlService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*") // フロントエンドからの通信を全許可
@RequiredArgsConstructor
@Slf4j
public class MissionMatrixController {

    private final OperatorRepository operatorRepository;
    private final InterruptQueueRepository interruptQueueRepository;
    private final MissionControlService missionControlService;
    private final MissionLogRepository missionLogRepository;

    // --- DTO DEFINITIONS ---
    public record OperatorDTO(Long id, String name, String nameKanji, int displayOrder) {}

    public record QueueDTO(List<String> report, List<String> feedback) {}

    public record SystemStatusResponse(
            List<OperatorDTO> operators,
            List<String> reportQueue,
            List<String> feedbackQueue,
            QueueDTO queues
    ) {}

    public record AllocationRequest(List<Long> presentOperatorIds) {}

    public record MissionAssignmentDTO(String missionType, List<OperatorDTO> assignedOperators) {}

    // 【変更点1】フロントから送られてくるデータの形（プルダウンで選んだID）に合わせました
    public record AdminUpdateRequest(
            Long nextAssemblyOperatorId,
            Long nextReportOperatorId,
            Long nextFeedbackOperatorId
    ) {}

    public record RotationInfoDTO(String type, OperatorDTO previous, OperatorDTO next) {}

    public record LastResultWithMetaDTO(String assignedDate, String createdAt, List<MissionAssignmentDTO> assignments) {}

    // -------------------------------------------------------------
    // ENDPOINT 1: システム状態の取得
    // -------------------------------------------------------------
    @GetMapping("/status")
    public SystemStatusResponse getSystemStatus() {
        log.info("[GATEWAY] Fetching central system status...");

        List<OperatorDTO> operators = operatorRepository.findAllByOrderByDisplayOrderAsc().stream()
                .map(op -> new OperatorDTO(op.getId(), op.getName(), op.getNameKanji(), op.getDisplayOrder()))
                .toList();

        List<String> reportQueue = interruptQueueRepository.findByTargetTypeOrderByCreatedAtAsc(MissionType.REPORT).stream()
                .map(q -> q.getOperator().getName())
                .toList();

        List<String> feedbackQueue = interruptQueueRepository.findByTargetTypeOrderByCreatedAtAsc(MissionType.FEEDBACK).stream()
                .map(q -> q.getOperator().getName())
                .toList();

        return new SystemStatusResponse(operators, reportQueue, feedbackQueue, new QueueDTO(reportQueue, feedbackQueue));
    }

    // -------------------------------------------------------------
    // ENDPOINT 1b: 直前の割当結果を取得（日付メタ付き）
    // -------------------------------------------------------------
    @GetMapping("/missions/last-result")
    public LastResultWithMetaDTO getLastResult() {
        return missionLogRepository.findFirstByIsInterruptFalseOrderByIdDesc()
                .map(lastLog -> {
                    List<MissionLog> batch = missionLogRepository.findByCreatedAt(lastLog.getCreatedAt());
                    Map<MissionType, List<Operator>> grouped = batch.stream()
                            .collect(Collectors.groupingBy(
                                    MissionLog::getMissionType,
                                    Collectors.mapping(MissionLog::getOperator, Collectors.toList())
                            ));
                    List<MissionAssignmentDTO> assignments = grouped.entrySet().stream()
                            .map(e -> new MissionAssignmentDTO(
                                    e.getKey().name(),
                                    e.getValue().stream()
                                            .map(op -> new OperatorDTO(op.getId(), op.getName(), op.getNameKanji(), op.getDisplayOrder()))
                                            .toList()
                            ))
                            .toList();
                    return new LastResultWithMetaDTO(
                            lastLog.getAssignedDate().toString(),
                            lastLog.getCreatedAt().toString(),
                            assignments
                    );
                })
                .orElse(new LastResultWithMetaDTO(null, null, List.of()));
    }

    // -------------------------------------------------------------
    // ENDPOINT 1c: ローテーション情報（前/次の担当者）
    // -------------------------------------------------------------
    @GetMapping("/missions/rotation")
    public List<RotationInfoDTO> getRotation() {
        List<Operator> allOps = operatorRepository.findAllByOrderByDisplayOrderAsc();
        List<RotationInfoDTO> rotations = new java.util.ArrayList<>();

        for (MissionType type : MissionType.values()) {
            Optional<MissionLog> lastLog = missionLogRepository.findFirstByMissionTypeAndIsInterruptFalseOrderByIdDesc(type);

            OperatorDTO previous = lastLog.map(log -> {
                Operator op = log.getOperator();
                return new OperatorDTO(op.getId(), op.getName(), op.getNameKanji(), op.getDisplayOrder());
            }).orElse(null);

            int lastDisplayOrder = lastLog.map(log -> log.getOperator().getDisplayOrder()).orElse(0);

            Operator nextOp = null;
            if (!allOps.isEmpty()) {
                if (lastLog.isEmpty()) {
                    nextOp = allOps.get(0);
                } else {
                    int foundIdx = -1;
                    for (int i = 0; i < allOps.size(); i++) {
                        if (allOps.get(i).getDisplayOrder() == lastDisplayOrder) {
                            foundIdx = i;
                            break;
                        }
                    }
                    nextOp = foundIdx >= 0 ? allOps.get((foundIdx + 1) % allOps.size()) : allOps.get(0);
                }
            }

            OperatorDTO next = nextOp == null ? null :
                    new OperatorDTO(nextOp.getId(), nextOp.getName(), nextOp.getNameKanji(), nextOp.getDisplayOrder());

            rotations.add(new RotationInfoDTO(type.name(), previous, next));
        }

        return rotations;
    }

    // -------------------------------------------------------------
    // ENDPOINT 2: ミッションアサインの実行
    // -------------------------------------------------------------
    @PostMapping("/missions/allocate")
    public List<MissionAssignmentDTO> allocateMissions(@RequestBody AllocationRequest request) {
        log.info("[GATEWAY] Triggering assignment algorithm for IDs: {}", request.presentOperatorIds());

        List<MissionLog> logs = missionControlService.calculateDailyMissions(request.presentOperatorIds());

        Map<MissionType, List<Operator>> grouped = logs.stream()
                .collect(Collectors.groupingBy(
                        MissionLog::getMissionType,
                        Collectors.mapping(MissionLog::getOperator, Collectors.toList())
                ));

        return grouped.entrySet().stream()
                .map(entry -> new MissionAssignmentDTO(
                        entry.getKey().name(),
                        entry.getValue().stream()
                                .map(op -> new OperatorDTO(op.getId(), op.getName(), op.getNameKanji(), op.getDisplayOrder()))
                                .toList()
                ))
                .toList();
    }

    // -------------------------------------------------------------
    // ADMIN ENDPOINT 1: 1回分のアサインを巻き戻す
    // -------------------------------------------------------------
    @DeleteMapping("/admin/rollback")
    @Transactional
    public Map<String, String> rollbackLastAssignment() {
        log.warn("[ADMIN] Emergency rollback triggered. Reversing last operation...");

        Optional<MissionLog> lastLog = missionLogRepository.findFirstByIsInterruptFalseOrderByIdDesc();

        if (lastLog.isPresent()) {
            // 【変更点2】日付(LocalDate)での全削除をやめ、最新ログの「作成日時(LocalDateTime)」で削除する
            // これにより、今日複数回テストしても「最後にボタンを押した1回分」だけが消えます
            LocalDateTime lastCreatedAt = lastLog.get().getCreatedAt();

            // ※注意: MissionLogRepository に以下のメソッドを追加してください！
            // void deleteByCreatedAt(LocalDateTime createdAt);
            missionLogRepository.deleteByCreatedAt(lastCreatedAt);

            log.info("[ADMIN] Successfully rolled back last assignment batch at: {}", lastCreatedAt);
            return Map.of("status", "SUCCESS", "message", "直近の割り当て（1回分）を破棄しました。");
        }

        return Map.of("status", "ERROR", "message", "巻き戻せるログが存在しません。");
    }

    // -------------------------------------------------------------
    // ADMIN ENDPOINT 2: ターゲットの強制同期（手動オーバーライド）
    // -------------------------------------------------------------
    @PostMapping("/admin/update-status")
    @Transactional
    public Map<String, String> updateSystemStatus(@RequestBody AdminUpdateRequest request) {
        log.info("[ADMIN] Overwriting system matrix status manually... Targets: {}", request);

        // 🔥【ここを追加】
        // 今日実行された本物のログが残っていると、日付の新鮮さでダミーログが負けて無視されてしまいます。
        // そのため、手動設定を適用する前に、今日（LocalDate.now()）のログを一旦すべてクリアして歴史を白紙に戻します。
        missionLogRepository.deleteByAssignedDate(java.time.LocalDate.now());
        log.info("[ADMIN] Cleared today's real logs to enable manual override shortcuts.");

        // 次回のターゲットを強制するために、ダミーログを挿入してポインターをずらす
        forceNextPointer(MissionType.ASSEMBLY, request.nextAssemblyOperatorId());
        forceNextPointer(MissionType.REPORT, request.nextReportOperatorId());
        forceNextPointer(MissionType.FEEDBACK, request.nextFeedbackOperatorId());

        log.info("[ADMIN] System status synchronized with manual overrides.");
        return Map.of("status", "SUCCESS", "message", "今日のアサイン履歴をリセットし、次回ターゲットを同期しました。");
    }

    /**
     * 指定されたオペレーターが「次回」選ばれるように、
     * 「その1つ前のオペレーターが前回担当した」というダミーログをDBに仕込む裏技メソッド
     */
    private void forceNextPointer(MissionType type, Long targetOperatorId) {
        if (targetOperatorId == null) return;

        Optional<Operator> targetOpOpt = operatorRepository.findById(targetOperatorId);
        if (targetOpOpt.isEmpty()) return;

        Operator targetOp = targetOpOpt.get();

        Operator previousOp = operatorRepository.findFirstByDisplayOrderLessThanOrderByDisplayOrderDesc(targetOp.getDisplayOrder())
                .orElseGet(() -> operatorRepository.findFirstByOrderByDisplayOrderDesc().orElse(targetOp));

        MissionLog dummyLog = new MissionLog();
        dummyLog.setMissionType(type);
        dummyLog.setOperator(previousOp);
        dummyLog.setAssignedDate(java.time.LocalDate.now().minusDays(1));

        // 🔥【修正】setIsInterrupt(false) から setInterrupt(false) に変更
        dummyLog.setInterrupt(false);

        dummyLog.setCreatedAt(LocalDateTime.now().minusSeconds(1)); // これでエラーが消えます

        missionLogRepository.save(dummyLog);
    }
}
