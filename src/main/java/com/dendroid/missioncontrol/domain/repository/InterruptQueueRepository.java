package com.dendroid.missioncontrol.domain.repository;

import com.dendroid.missioncontrol.domain.model.InterruptQueue;
import com.dendroid.missioncontrol.domain.model.MissionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface InterruptQueueRepository extends JpaRepository<InterruptQueue, Long> {
    // 特定ミッションの割り込み待ちを、古い順にソートして取得
    List<InterruptQueue> findByTargetTypeOrderByCreatedAtAsc(MissionType targetType);
}