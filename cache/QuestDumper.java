package net.runelite.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public class QuestDumper {
    public static void main(String[] args) throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        mapper.enable(SerializationFeature.INDENT_OUTPUT);

        Map<Integer, String> questMap = new HashMap<>();
        for (Quest quest : Quest.values()) {
            questMap.put(quest.getId(), quest.getName());
        }

        questMap.put(2307, "Recipe for Disaster/Another Cook's Quest");
        questMap.put(2308, "Recipe for Disaster/Freeing the Mountain Dwarf");
        questMap.put(2309, "Recipe for Disaster/Freeing the Goblin generals");
        questMap.put(2310, "Recipe for Disaster/Freeing Pirate Pete");
        questMap.put(2311, "Recipe for Disaster/Freeing the Lumbridge Guide");
        questMap.put(2312, "Recipe for Disaster/Freeing Evil Dave");
        questMap.put(2313, "Recipe for Disaster/Freeing Skrach Uglogwee");
        questMap.put(2314, "Recipe for Disaster/Freeing Sir Amik Varze");
        questMap.put(2315, "Recipe for Disaster/Freeing King Awowogei");
        questMap.put(2316, "Recipe for Disaster/Defeating the Culinaromancer");

        mapper.writeValue(new File(args[0]), questMap);
    }
}
