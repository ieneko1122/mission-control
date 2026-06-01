package com.dendroid.missioncontrol.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime; // クラスの一番上に追加してください

@Entity
@Table(name = "MISSION_LOGS")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class MissionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "assigned_date", nullable = false)
    private LocalDate assignedDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "operator_id", nullable = false)
    private Operator operator;

    @Enumerated(EnumType.STRING)
    @Column(name = "mission_type", nullable = false)
    private MissionType missionType;

    @Column(name = "is_interrupt", nullable = false)
    private boolean isInterrupt;

    // 🔥【ここを追加】1回分のロールバック判定に使用する作成日時
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}