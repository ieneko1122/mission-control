package com.dendroid.missioncontrol.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "INTERRUPT_QUEUE")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class InterruptQueue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // どのオペレーターが割り込み待ちか
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "operator_id", nullable = false)
    private Operator operator;

    // どのミッションに割り込むべきか
    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false)
    private MissionType targetType;

    // 欠席が記録された日時（古い順にソートして割り込ませるため）
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * サイバーパンク風ファクトリーメソッド（ドメイン知識のカプセル化）
     */
    public static InterruptQueue create(Operator operator, MissionType type) {
        return new InterruptQueue(null, operator, type, LocalDateTime.now());
    }
}
