package com.dendroid.missioncontrol.domain.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "OPERATORS")
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class Operator {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "name_kanji")
    private String nameKanji;

    @Column(name = "display_order", nullable = false, unique = true)
    private int displayOrder;
}