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
        int size = allOps.size();

        for (MissionType type : MissionType.values()) {
            // 直近バッチの「最後の人」（= isInterrupt=false の最新ログ。次回ポインターの起点）
            Optional<MissionLog> lastLog = missionLogRepository.findFirstByMissionTypeAndIsInterruptFalseOrderByIdDesc(type);

            OperatorDTO previous = null;
            OperatorDTO next = null;

            if (size > 0) {
                if (lastLog.isEmpty()) {
                    // まだ一度も割当が無い → 前回は無し、次回はリング先頭
                    next = toDTO(allOps.get(0));
                } else {
                    int lastOrder = lastLog.get().getOperator().getDisplayOrder();
                    int idxLast = 0;
                    for (int i = 0; i < size; i++) {
                        if (allOps.get(i).getDisplayOrder() == lastOrder) {
                            idxLast = i;
                            break;
                        }
                    }
                    // 次回 = 直近バッチの最後の人の「次」（= 次バッチの1人目 / 今日の直後の人）
                    int nextIdx = (idxLast + 1) % size;
                    next = toDTO(allOps.get(nextIdx));

                    // 前回 = 直近の「通常ローテバッチ」開始位置の1つ前（= 前回ローテの最後の人 / 直前の人）。
                    //   割り込み(isInterrupt=true)はポインターを進めない設計なので、
                    //   getRequiredSlots() ではなく「そのバッチで実際に進んだ通常枠の人数」だけ巻き戻す。
                    //   これにより欠席明け割り込みがあっても前回表示が1人ズレない。
                    java.time.LocalDateTime batchAt = lastLog.get().getCreatedAt();
                    long normalCount = missionLogRepository.findByCreatedAt(batchAt).stream()
                            .filter(l -> l.getMissionType() == type && !l.isInterrupt())
                            .count();
                    if (normalCount < 1) normalCount = 1; // 念のためのガード
                    int prevIdx = (int) ((((idxLast - normalCount) % size) + size) % size);
                    previous = toDTO(allOps.get(prevIdx));
                }
            }

            rotations.add(new RotationInfoDTO(type.name(), previous, next));
        }

        return rotations;
    }

    private OperatorDTO toDTO(Operator op) {
        return new OperatorDTO(op.getId(), op.getName(), op.getNameKanji(), op.getDisplayOrder());
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
