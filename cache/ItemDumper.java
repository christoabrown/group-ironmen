package net.runelite.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.File;
import java.io.IOException;
import java.util.*;
import net.runelite.client.game.ItemMapping;

public class ItemDumper {
    public static void main(String[] args) throws IOException {
        File itemDataFolder = new File(args[0]);

        File[] jsonFiles = itemDataFolder.listFiles((dir, name) -> name.endsWith(".json"));

        ObjectMapper objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

        for (File jsonFile : jsonFiles) {
            processItemFile(jsonFile, objectMapper);
        }
    }

    private static void processItemFile(File file, ObjectMapper objectMapper) throws IOException {
        Map<String, Object> itemData = objectMapper.readValue(file, Map.class);

        List<Map<String, Integer>> tradeableItems = fetchTradeableItems((int) itemData.get("id"));

        if (tradeableItems != null) {
            tradeableItems.sort(Comparator.comparingInt(item -> item.get("id")));
        }

        itemData.put("mapping", tradeableItems);

        objectMapper.writeValue(file, itemData);
    }

    private static List<Map<String, Integer>> fetchTradeableItems(int itemId) {
        Collection<ItemMapping> itemMappings = ItemMapping.map(itemId);

        if (itemMappings == null || itemMappings.isEmpty()) {
            return null;
        }

        List<Map<String, Integer>> tradeableMappings = new ArrayList<>();

        for (ItemMapping mapping : itemMappings) {
            int tradeableItemId = mapping.getTradeableItem();

            if (tradeableItemId == itemId) {
                continue;
            }

            List<Map<String, Integer>> subMappings = fetchTradeableItems(tradeableItemId);
            if (subMappings != null) {
                for (Map<String, Integer> subMapping : subMappings) {
                    tradeableMappings.add(createItemMapping(subMapping.get("id"), (int) (subMapping.get("quantity") * mapping.getQuantity())));
                }
            } else {
                tradeableMappings.add(createItemMapping(tradeableItemId, (int) mapping.getQuantity()));
            }
        }

        return tradeableMappings;
    }

    private static Map<String, Integer> createItemMapping(int itemId, int quantity) {
        Map<String, Integer> itemMapping = new LinkedHashMap<>();
        itemMapping.put("id", itemId);
        itemMapping.put("quantity", quantity);

        return itemMapping;
    }
}
