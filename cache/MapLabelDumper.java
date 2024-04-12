package net.runelite.cache;

import com.google.gson.Gson;
import lombok.extern.slf4j.Slf4j;
import net.runelite.cache.definitions.AreaDefinition;
import net.runelite.cache.definitions.FontDefinition;
import net.runelite.cache.definitions.SpriteDefinition;
import net.runelite.cache.definitions.WorldMapElementDefinition;
import net.runelite.cache.fs.Store;
import net.runelite.cache.region.Position;
import org.apache.commons.cli.CommandLine;
import org.apache.commons.cli.CommandLineParser;
import org.apache.commons.cli.DefaultParser;
import org.apache.commons.cli.Option;
import org.apache.commons.cli.Options;
import org.apache.commons.cli.ParseException;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Slf4j
public class MapLabelDumper
{
	private static String outputDirectory;

	public static void main(String[] args) throws IOException
	{
		Options options = new Options();
		options.addOption(Option.builder().longOpt("cachedir").hasArg().required().build());
		options.addOption(Option.builder().longOpt("outputdir").hasArg().required().build());

		CommandLineParser parser = new DefaultParser();
		CommandLine cmd;
		try
		{
			cmd = parser.parse(options, args);
		}
		catch (ParseException ex)
		{
			System.err.println("Error parsing command line options: " + ex.getMessage());
			System.exit(-1);
			return;
		}

		final String cacheDirectory = cmd.getOptionValue("cachedir");
		outputDirectory = cmd.getOptionValue("outputdir");

		File base = new File(cacheDirectory);
		File outDir = new File(outputDirectory);
		outDir.mkdirs();

		try (Store store = new Store(base))
		{
			store.load();

			WorldMapManager worldMapManager = new WorldMapManager(store);
			worldMapManager.load();
			AreaManager areas = new AreaManager(store);
			areas.load();
			FontManager fonts = new FontManager(store);
			fonts.load();
			SpriteManager sprites = new SpriteManager(store);
			sprites.load();

			List<Object[]> result = new ArrayList<>();

			FontName[] fontSizes = new FontName[]{FontName.VERDANA_11, FontName.VERDANA_13, FontName.VERDANA_15};
			List<WorldMapElementDefinition> elements = worldMapManager.getElements();
			int x = 0;
			for (WorldMapElementDefinition element : elements)
			{
				AreaDefinition area = areas.getArea(element.getAreaDefinitionId());
				Position worldPosition = element.getWorldPosition();
				if (area == null || area.getName() == null)
				{
					continue;
				}

				result.add(new Object[]{
						worldPosition.getX(),
						worldPosition.getY(),
						worldPosition.getZ()
				});

				FontName fontSize = fontSizes[area.getTextScale()];
				FontDefinition font = fonts.findFontByName(fontSize.getName());
				String areaLabel = area.getName();
				String[] lines = areaLabel.split("<br>");
				int ascent = 0;
				int startImageWidth = 0;
				for (String line : lines)
				{
					startImageWidth = Math.max(startImageWidth, font.stringWidth(line));
				}
				startImageWidth += 200;
				int startImageHeight = 300;
				BufferedImage image = new BufferedImage(startImageWidth, startImageHeight, BufferedImage.TYPE_INT_ARGB);

				for (String line : lines)
				{
					int advance = 0;
					int stringWidth = font.stringWidth(line);
					for (int i = 0; i < line.length(); ++i)
					{
						char c = line.charAt(i);
						SpriteDefinition sprite = sprites.findSpriteByArchiveName(fontSize.getName(), c);
						if (sprite.getWidth() != 0 && sprite.getHeight() != 0)
						{
							blitGlyph(image,
                                                                  advance + (startImageWidth / 2) - (stringWidth / 2),
                                                                  ascent + (startImageHeight / 2),
                                                                  area.getTextColor(),
                                                                  sprite
							);
						}

						advance += font.getAdvances()[c];
					}
					ascent += font.getAscent() / 2;
				}

				int imageTop = 0;
				int imageBottom = 0;
				for (int y = 0; y < startImageHeight; ++y) {
					boolean lineHasPixels = false;

					for (int xx = 0; xx < startImageWidth; ++xx)
					{
						if (image.getRGB(xx, y) != 0)
						{
							lineHasPixels = true;
						}
					}

					if (lineHasPixels)
					{
						if (imageTop == 0)
						{
							imageTop = y;
						}
						else
						{
							imageBottom = Math.max(imageBottom, y);
						}
					}
				}
                                imageBottom += 1;

				int imageLeft = 0;
				int imageRight = 0;
				for (int xx = 0; xx < startImageWidth; ++xx)
				{
					boolean columnHasPixels = false;

					for (int y = 0; y < startImageHeight; ++y)
					{
						if (image.getRGB(xx, y) != 0)
						{
							columnHasPixels = true;
						}
					}

					if (columnHasPixels)
					{
						if (imageLeft == 0)
						{
							imageLeft = xx;
						}
						else
						{
							imageRight = Math.max(imageRight, xx);
						}
					}
				}
                                imageRight += 1;

				int imageHeight = imageBottom - imageTop;
				int imageWidth = imageRight - imageLeft;
				BufferedImage finalImage = new BufferedImage(imageWidth, imageHeight, BufferedImage.TYPE_INT_ARGB);
				Graphics g = finalImage.createGraphics();
				g.drawImage(
						image,
						0,
						0,
						imageWidth,
						imageHeight,
						imageLeft,
						imageTop,
						imageRight,
						imageBottom,
						null
				);

				File imageFile = new File(outDir, "" + (x++) + ".png");
				ImageIO.write(finalImage, "png", imageFile);
			}

			try {
				Gson gson = new Gson();
				File jsonFile = new File(outDir, "map-labels.json");
				FileWriter writer = new FileWriter(jsonFile);
				gson.toJson(result, writer);
				writer.flush();
				writer.close();
			} catch (Exception ex) {
				log.error("Failed to write map-labels.json", ex);
			}
		}
	}

	private static void blitGlyph(BufferedImage dst, int x, int y, int color, SpriteDefinition glyph)
	{
		int[] pixels = glyph.getPixels();
		int[] shadowPixels = new int[pixels.length];
		for (int i = 0; i < pixels.length; ++i)
		{
			if (pixels[i] != 0)
			{
				pixels[i] = color;
				shadowPixels[i] = 0xFF000000;
			}
		}
		SpriteDefinition shadow = new SpriteDefinition();
		shadow.setPixels(shadowPixels);
		shadow.setOffsetX(glyph.getOffsetX());
		shadow.setOffsetY(glyph.getOffsetY());
		shadow.setWidth(glyph.getWidth());
		shadow.setHeight(glyph.getHeight());

		blitIcon(dst, x + 1, y + 1, shadow);
		blitIcon(dst, x, y, glyph);
	}

	private static void blitIcon(BufferedImage dst, int x, int y, SpriteDefinition sprite)
	{
		x += sprite.getOffsetX();
		y += sprite.getOffsetY();

		int ymin = Math.max(0, -y);
		int ymax = Math.min(sprite.getHeight(), dst.getHeight() - y);

		int xmin = Math.max(0, -x);
		int xmax = Math.min(sprite.getWidth(), dst.getWidth() - x);

		for (int yo = ymin; yo < ymax; yo++)
		{
			for (int xo = xmin; xo < xmax; xo++)
			{
				int rgb = sprite.getPixels()[xo + (yo * sprite.getWidth())];
				if (rgb != 0)
				{
					dst.setRGB(x + xo, y + yo, rgb | 0xFF000000);
				}
			}
		}
	}
}
