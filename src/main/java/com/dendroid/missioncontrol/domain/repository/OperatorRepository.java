package com.dendroid.missioncontrol.domain.repository;

import com.dendroid.missioncontrol.domain.model.Operator;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface OperatorRepository extends JpaRepository<Operator, Long> {
    // 名簿順にソートして全件取得（JPAが自動で SQL を生成）
    List<Operator> findAllByOrderByDisplayOrderAsc();

    // ダミーログ作成用（ターゲットの1つ前の人を探すため）
    java.util.Optional<Operator> findFirstByDisplayOrderLessThanOrderByDisplayOrderDesc(int displayOrder);
    java.util.Optional<Operator> findFirstByOrderByDisplayOrderDesc();
}