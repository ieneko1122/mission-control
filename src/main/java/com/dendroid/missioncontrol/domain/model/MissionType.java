package com.dendroid.missioncontrol.domain.model;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum MissionType {
    ASSEMBLY("ASSEMBLY"),
    REPORT("REPORT"),
    FEEDBACK("FEEDBACK");

    private final String description;

    /**
     * 各ミッションに必要なオペレーター（人員）のスロット数を返す
     * Javaのモダンな「switch式」を活用（break不要、コンパイル時網羅性チェック対象）
     */
    public int getRequiredSlots() {
        return switch (this) {
            case ASSEMBLY -> 1;
            case REPORT, FEEDBACK -> 2;
        };
    }
}