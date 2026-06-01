package com.dendroid.missioncontrol.infrastructure.initializer;

import com.dendroid.missioncontrol.domain.model.Operator;
import com.dendroid.missioncontrol.domain.repository.OperatorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class SystemInitializer implements CommandLineRunner {

    private final OperatorRepository operatorRepository;

    @Override
    public void run(String... args) throws Exception {
        record OperatorSeed(String name, String nameKanji) {}

        List<OperatorSeed> seeds = List.of(
                new OperatorSeed("MAKINO",   "牧野"),
                new OperatorSeed("TSUTSUMI", "堤"),
                new OperatorSeed("KUDOH",    "工藤"),
                new OperatorSeed("NIKI",     "二木"),
                new OperatorSeed("ASANUMA",  "浅沼"),
                new OperatorSeed("KISE",     "木瀬"),
                new OperatorSeed("HAYAKAWA", "早川"),
                new OperatorSeed("BAMBA",    "馬塲"),
                new OperatorSeed("KIMURA",   "木村")
        );

        java.util.Map<String, String> kanjiMap = new java.util.HashMap<>();
        seeds.forEach(s -> kanjiMap.put(s.name(), s.nameKanji()));

        if (operatorRepository.count() == 0) {
            log.info("[SYSTEM] COLD BOOT: Registering 9 Operators into System...");
            java.util.stream.IntStream.range(0, seeds.size())
                    .mapToObj(i -> new Operator(null, seeds.get(i).name(), seeds.get(i).nameKanji(), i + 1))
                    .forEach(operatorRepository::save);
            log.info("[SYSTEM] ACCESS GRANTED: 9 Operators synchronized successfully.");
            return;
        }

        // 既存レコードに nameKanji が未設定の場合だけ埋める
        List<Operator> existing = operatorRepository.findAllByOrderByDisplayOrderAsc();
        boolean updated = false;
        for (Operator op : existing) {
            if (op.getNameKanji() == null && kanjiMap.containsKey(op.getName())) {
                op.setNameKanji(kanjiMap.get(op.getName()));
                operatorRepository.save(op);
                updated = true;
            }
        }
        if (updated) {
            log.info("[SYSTEM] Kanji names synchronized for existing operators.");
        } else {
            log.info("[SYSTEM] Operators already initialized in Matrix DB.");
        }
    }
}
