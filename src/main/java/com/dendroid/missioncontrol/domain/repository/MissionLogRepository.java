package com.dendroid.missioncontrol.domain.repository;

import com.dendroid.missioncontrol.domain.model.MissionLog;
import com.dendroid.missioncontrol.domain.model.MissionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface MissionLogRepository extends JpaRepository<MissionLog, Long> {

    // 既存のメソッドはそのまま
    Optional<MissionLog> findFirstByIsInterruptFalseOrderByIdDesc();
    void deleteByAssignedDate(LocalDate assignedDate);

    // ★追加：タイプ別＆通常ローテーション（isInterrupt=false）の最新ログを取得
    Optional<MissionLog> findFirstByMissionTypeAndIsInterruptFalseOrderByIdDesc(MissionType missionType);

    // 1回分のロールバック用（完全一致する日時のものを消す）
    void deleteByCreatedAt(java.time.LocalDateTime createdAt);

    // 直前バッチの全ログ取得
    java.util.List<MissionLog> findByCreatedAt(java.time.LocalDateTime createdAt);
}