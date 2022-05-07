package net.runelite.cache;

import net.runelite.cache.definitions.loaders.ModelLoader;
import net.runelite.cache.definitions.providers.ModelProvider;
import net.runelite.cache.fs.Archive;
import net.runelite.cache.fs.Index;
import net.runelite.cache.fs.Store;
import net.runelite.cache.item.ItemSpriteFactory;
import org.apache.commons.cli.*;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class Cache {
  public static void main(String[] args) throws IOException {
    Options options = new Options();

    options.addOption("c", "cache", true, "cache base");

    options.addOption(null, "ids", true, "csv file with item ids to create images from");
    options.addOption(null, "output", true, "directory to dump item model images to");

    CommandLineParser parser = new DefaultParser();
    CommandLine cmd;
    try {
      cmd = parser.parse(options, args);
    } catch (ParseException ex) {
      System.err.println("Error parsing command line options: " + ex.getMessage());
      System.exit(-1);
      return;
    }

    String cache = cmd.getOptionValue("cache");

    Store store = loadStore(cache);

    if (cmd.hasOption("output") && cmd.hasOption("ids")) {
      String outputDir = cmd.getOptionValue("output");
      String imageIdsFile = cmd.getOptionValue("ids");

      if (outputDir == null) {
        System.err.println("Item image directory must be specified");
        return;
      }

      if (imageIdsFile == null) {
        System.err.println("Image ID CSV file must be specified");
        return;
      }

      List<Integer> itemIds = new ArrayList<>();
      try (BufferedReader br = new BufferedReader(new FileReader(imageIdsFile))) {
        String line = br.readLine();
        if (line != null) {
          String[] values = line.split(",");
          for (String value : values) {
            Integer itemId = Integer.parseInt(value);
            itemIds.add(itemId);
          }
        }
      }

      System.out.println("Dumping item model images to " + outputDir);
      dumpItemModelImages(store, new File(outputDir), itemIds);
    } else {
      System.err.println("Nothing to do");
    }
  }

  private static Store loadStore(String cache) throws IOException {
    Store store = new Store(new File(cache));
    store.load();
    return store;
  }

  private static void dumpItemModelImages(Store store, File outputDir, List<Integer> itemIds) throws IOException {
    ItemManager dumper = new ItemManager(store);
    dumper.load();

    ModelProvider modelProvider = modelId -> {
      Index models = store.getIndex(IndexType.MODELS);
      Archive archive = models.getArchive(modelId);

      byte[] data = archive.decompress(store.getStorage().loadArchive(archive));
      return new ModelLoader().load(modelId, data);
    };

    SpriteManager spriteManager = new SpriteManager(store);
    spriteManager.load();

    TextureManager textureManager = new TextureManager(store);
    textureManager.load();

    if (!outputDir.exists()) {
      outputDir.mkdir();
    }

    for (Integer itemId : itemIds) {
      try {
        final int border = 1;
        final int shadowColor = 0x111111;
        final boolean noted = false;
        BufferedImage sprite = ItemSpriteFactory.createSprite(
            dumper,
            modelProvider,
            spriteManager,
            textureManager,
            itemId,
            1,
            border,
            shadowColor,
            noted);

        File out = new File(outputDir, itemId + ".png");
        assert sprite != null;
        ImageIO.write(sprite, "PNG", out);
      } catch (Exception ex) {
        System.err.println("error dumping item " + itemId);
      }
    }
  }
}
