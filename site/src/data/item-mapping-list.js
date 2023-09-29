import { Item } from './item.js';
class ItemMapping {
  constructor(tradeableItem, ...untradableItems) {
    this.quantity = 1;
    this.includeVariations = false;

    if (typeof untradableItems[0] === 'boolean') {
      this.includeVariations = untradableItems[0];
      this.quantity = untradableItems[1];
      untradableItems = untradableItems.slice(2);
    }

    if (typeof untradableItems[0] === 'number') {
      this.includeVariations = false;
      this.quantity = untradableItems[0];
      untradableItems = untradableItems.slice(1);
    }

    this.tradeableItem = tradeableItem;
    this.untradableItems = untradableItems;
  }
}
const itemMappings = {};

	// Barrows equipment
	itemMappings.ITEM_AHRIMS_HOOD = new ItemMapping(Item.itemId('AHRIMS_HOOD'), Item.itemId('AHRIMS_HOOD_25'), Item.itemId('AHRIMS_HOOD_50'), Item.itemId('AHRIMS_HOOD_75'), Item.itemId('AHRIMS_HOOD_100'));
	itemMappings.ITEM_AHRIMS_ROBETOP = new ItemMapping(Item.itemId('AHRIMS_ROBETOP'), Item.itemId('AHRIMS_ROBETOP_25'), Item.itemId('AHRIMS_ROBETOP_50'), Item.itemId('AHRIMS_ROBETOP_75'), Item.itemId('AHRIMS_ROBETOP_100'));
	itemMappings.ITEM_AHRIMS_ROBEBOTTOM = new ItemMapping(Item.itemId('AHRIMS_ROBESKIRT'), Item.itemId('AHRIMS_ROBESKIRT_25'), Item.itemId('AHRIMS_ROBESKIRT_50'), Item.itemId('AHRIMS_ROBESKIRT_75'), Item.itemId('AHRIMS_ROBESKIRT_100'));
	itemMappings.ITEM_AHRIMS_STAFF = new ItemMapping(Item.itemId('AHRIMS_STAFF'), Item.itemId('AHRIMS_STAFF_25'), Item.itemId('AHRIMS_STAFF_50'), Item.itemId('AHRIMS_STAFF_75'), Item.itemId('AHRIMS_STAFF_100'));
	itemMappings.ITEM_KARILS_COIF = new ItemMapping(Item.itemId('KARILS_COIF'), Item.itemId('KARILS_COIF_25'), Item.itemId('KARILS_COIF_50'), Item.itemId('KARILS_COIF_75'), Item.itemId('KARILS_COIF_100'));
	itemMappings.ITEM_KARILS_LEATHERTOP = new ItemMapping(Item.itemId('KARILS_LEATHERTOP'), Item.itemId('KARILS_LEATHERTOP_25'), Item.itemId('KARILS_LEATHERTOP_50'), Item.itemId('KARILS_LEATHERTOP_75'), Item.itemId('KARILS_LEATHERTOP_100'));
	itemMappings.ITEM_KARILS_LEATHERSKIRT = new ItemMapping(Item.itemId('KARILS_LEATHERSKIRT'), Item.itemId('KARILS_LEATHERSKIRT_25'), Item.itemId('KARILS_LEATHERSKIRT_50'), Item.itemId('KARILS_LEATHERSKIRT_75'), Item.itemId('KARILS_LEATHERSKIRT_100'));
	itemMappings.ITEM_KARILS_CROSSBOW = new ItemMapping(Item.itemId('KARILS_CROSSBOW'), Item.itemId('KARILS_CROSSBOW_25'), Item.itemId('KARILS_CROSSBOW_50'), Item.itemId('KARILS_CROSSBOW_75'), Item.itemId('KARILS_CROSSBOW_100'));
	itemMappings.ITEM_DHAROKS_HELM = new ItemMapping(Item.itemId('DHAROKS_HELM'), Item.itemId('DHAROKS_HELM_25'), Item.itemId('DHAROKS_HELM_50'), Item.itemId('DHAROKS_HELM_75'), Item.itemId('DHAROKS_HELM_100'));
	itemMappings.ITEM_DHAROKS_PLATEBODY = new ItemMapping(Item.itemId('DHAROKS_PLATEBODY'), Item.itemId('DHAROKS_PLATEBODY_25'), Item.itemId('DHAROKS_PLATEBODY_50'), Item.itemId('DHAROKS_PLATEBODY_75'), Item.itemId('DHAROKS_PLATEBODY_100'));
	itemMappings.ITEM_DHAROKS_PLATELEGS = new ItemMapping(Item.itemId('DHAROKS_PLATELEGS'), Item.itemId('DHAROKS_PLATELEGS_25'), Item.itemId('DHAROKS_PLATELEGS_50'), Item.itemId('DHAROKS_PLATELEGS_75'), Item.itemId('DHAROKS_PLATELEGS_100'));
	itemMappings.ITEM_DHARKS_GREATEAXE = new ItemMapping(Item.itemId('DHAROKS_GREATAXE'), Item.itemId('DHAROKS_GREATAXE_25'), Item.itemId('DHAROKS_GREATAXE_50'), Item.itemId('DHAROKS_GREATAXE_75'), Item.itemId('DHAROKS_GREATAXE_100'));
	itemMappings.ITEM_GUTHANS_HELM = new ItemMapping(Item.itemId('GUTHANS_HELM'), Item.itemId('GUTHANS_HELM_25'), Item.itemId('GUTHANS_HELM_50'), Item.itemId('GUTHANS_HELM_75'), Item.itemId('GUTHANS_HELM_100'));
	itemMappings.ITEM_GUTHANS_PLATEBODY = new ItemMapping(Item.itemId('GUTHANS_PLATEBODY'), Item.itemId('GUTHANS_PLATEBODY_25'), Item.itemId('GUTHANS_PLATEBODY_50'), Item.itemId('GUTHANS_PLATEBODY_75'), Item.itemId('GUTHANS_PLATEBODY_100'));
	itemMappings.ITEM_GUTHANS_CHAINSKIRT = new ItemMapping(Item.itemId('GUTHANS_CHAINSKIRT'), Item.itemId('GUTHANS_CHAINSKIRT_25'), Item.itemId('GUTHANS_CHAINSKIRT_50'), Item.itemId('GUTHANS_CHAINSKIRT_75'), Item.itemId('GUTHANS_CHAINSKIRT_100'));
	itemMappings.ITEM_GUTHANS_WARSPEAR = new ItemMapping(Item.itemId('GUTHANS_WARSPEAR'), Item.itemId('GUTHANS_WARSPEAR_25'), Item.itemId('GUTHANS_WARSPEAR_50'), Item.itemId('GUTHANS_WARSPEAR_75'), Item.itemId('GUTHANS_WARSPEAR_100'));
	itemMappings.ITEM_TORAGS_HELM = new ItemMapping(Item.itemId('TORAGS_HELM'), Item.itemId('TORAGS_HELM_25'), Item.itemId('TORAGS_HELM_50'), Item.itemId('TORAGS_HELM_75'), Item.itemId('TORAGS_HELM_100'));
	itemMappings.ITEM_TORAGS_PLATEBODY = new ItemMapping(Item.itemId('TORAGS_PLATEBODY'), Item.itemId('TORAGS_PLATEBODY_25'), Item.itemId('TORAGS_PLATEBODY_50'), Item.itemId('TORAGS_PLATEBODY_75'), Item.itemId('TORAGS_PLATEBODY_100'));
	itemMappings.ITEM_TORAGS_PLATELEGS = new ItemMapping(Item.itemId('TORAGS_PLATELEGS'), Item.itemId('TORAGS_PLATELEGS_25'), Item.itemId('TORAGS_PLATELEGS_50'), Item.itemId('TORAGS_PLATELEGS_75'), Item.itemId('TORAGS_PLATELEGS_100'));
	itemMappings.ITEM_TORAGS_HAMMERS = new ItemMapping(Item.itemId('TORAGS_HAMMERS'), Item.itemId('TORAGS_HAMMERS_25'), Item.itemId('TORAGS_HAMMERS_50'), Item.itemId('TORAGS_HAMMERS_75'), Item.itemId('TORAGS_HAMMERS_100'));
	itemMappings.ITEM_VERACS_HELM = new ItemMapping(Item.itemId('VERACS_HELM'), Item.itemId('VERACS_HELM_25'), Item.itemId('VERACS_HELM_50'), Item.itemId('VERACS_HELM_75'), Item.itemId('VERACS_HELM_100'));
	itemMappings.ITEM_VERACS_BRASSARD = new ItemMapping(Item.itemId('VERACS_BRASSARD'), Item.itemId('VERACS_BRASSARD_25'), Item.itemId('VERACS_BRASSARD_50'), Item.itemId('VERACS_BRASSARD_75'), Item.itemId('VERACS_BRASSARD_100'));
	itemMappings.ITEM_VERACS_PLATESKIRT = new ItemMapping(Item.itemId('VERACS_PLATESKIRT'), Item.itemId('VERACS_PLATESKIRT_25'), Item.itemId('VERACS_PLATESKIRT_50'), Item.itemId('VERACS_PLATESKIRT_75'), Item.itemId('VERACS_PLATESKIRT_100'));
	itemMappings.ITEM_VERACS_FLAIL = new ItemMapping(Item.itemId('VERACS_FLAIL'), Item.itemId('VERACS_FLAIL_25'), Item.itemId('VERACS_FLAIL_50'), Item.itemId('VERACS_FLAIL_75'), Item.itemId('VERACS_FLAIL_100'));

	// Dragon equipment ornament kits
	itemMappings.ITEM_DRAGON_2H_SWORD = new ItemMapping(Item.itemId('DRAGON_2H_SWORD'), Item.itemId('DRAGON_2H_SWORD_CR'));
	itemMappings.ITEM_DRAGON_BATTLEAXE = new ItemMapping(Item.itemId('DRAGON_BATTLEAXE'), Item.itemId('DRAGON_BATTLEAXE_CR'));
	itemMappings.ITEM_DRAGON_CLAWS = new ItemMapping(Item.itemId('DRAGON_CLAWS'), Item.itemId('DRAGON_CLAWS_CR'));
	itemMappings.ITEM_DRAGON_CROSSBOW = new ItemMapping(Item.itemId('DRAGON_CROSSBOW'), Item.itemId('DRAGON_CROSSBOW_CR'));
	itemMappings.ITEM_DRAGON_DAGGER = new ItemMapping(Item.itemId('DRAGON_DAGGER'), Item.itemId('DRAGON_DAGGER_CR'));
	itemMappings.ITEM_DRAGON_DAGGER_P = new ItemMapping(Item.itemId('DRAGON_DAGGERP'), Item.itemId('DRAGON_DAGGER_PCR'));
	itemMappings.ITEM_DRAGON_DAGGER_P_ = new ItemMapping(Item.itemId('DRAGON_DAGGERP_5680'), Item.itemId('DRAGON_DAGGER_PCR_28023'));
	itemMappings.ITEM_DRAGON_DAGGER_P__ = new ItemMapping(Item.itemId('DRAGON_DAGGERP_5698'), Item.itemId('DRAGON_DAGGER_PCR_28025'));
	itemMappings.ITEM_DRAGON_HALBERD = new ItemMapping(Item.itemId('DRAGON_HALBERD'), Item.itemId('DRAGON_HALBERD_CR'));
	// Dragon longsword and Dragon mace are included in "Bounty hunter" section
	itemMappings.ITEM_DRAGON_SCIMITAR = new ItemMapping(Item.itemId('DRAGON_SCIMITAR'), Item.itemId('DRAGON_SCIMITAR_OR'), Item.itemId('DRAGON_SCIMITAR_CR'));
	itemMappings.ITEM_DRAGON_SCIMITAR_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_SCIMITAR_ORNAMENT_KIT'), Item.itemId('DRAGON_SCIMITAR_OR'));
	itemMappings.ITEM_DRAGON_SPEAR = new ItemMapping(Item.itemId('DRAGON_SPEAR'), Item.itemId('DRAGON_SPEAR_CR'));
	itemMappings.ITEM_DRAGON_SPEAR_P = new ItemMapping(Item.itemId('DRAGON_SPEARP'), Item.itemId('DRAGON_SPEAR_PCR'));
	itemMappings.ITEM_DRAGON_SPEAR_P_ = new ItemMapping(Item.itemId('DRAGON_SPEARP_5716'), Item.itemId('DRAGON_SPEAR_PCR_28045'));
	itemMappings.ITEM_DRAGON_SPEAR_P__ = new ItemMapping(Item.itemId('DRAGON_SPEARP_5730'), Item.itemId('DRAGON_SPEAR_PCR_28047'));
	itemMappings.ITEM_DRAGON_SWORD = new ItemMapping(Item.itemId('DRAGON_SWORD'), Item.itemId('DRAGON_SWORD_CR'));
	itemMappings.ITEM_DRAGON_WARHAMMER = new ItemMapping(Item.itemId('DRAGON_WARHAMMER'), Item.itemId('DRAGON_WARHAMMER_CR'));
	itemMappings.ITEM_DRAGON_DEFENDER = new ItemMapping(Item.itemId('DRAGON_DEFENDER_ORNAMENT_KIT'), Item.itemId('DRAGON_DEFENDER_T'));
	itemMappings.ITEM_DRAGON_PICKAXE = new ItemMapping(Item.itemId('DRAGON_PICKAXE'), Item.itemId('DRAGON_PICKAXE_12797'), Item.itemId('DRAGON_PICKAXE_OR'), Item.itemId('DRAGON_PICKAXE_OR_25376'));
	itemMappings.ITEM_DRAGON_PICKAXE_OR = new ItemMapping(Item.itemId('ZALCANO_SHARD'), Item.itemId('DRAGON_PICKAXE_OR'));
	itemMappings.ITEM_DRAGON_AXE = new ItemMapping(Item.itemId('DRAGON_AXE'), Item.itemId('DRAGON_AXE_OR'));
	itemMappings.ITEM_DRAGON_HARPOON = new ItemMapping(Item.itemId('DRAGON_HARPOON'), Item.itemId('DRAGON_HARPOON_OR'));
	itemMappings.ITEM_INFERNAL_PICKAXE_OR = new ItemMapping(Item.itemId('INFERNAL_PICKAXE'), Item.itemId('INFERNAL_PICKAXE_OR'));
	itemMappings.ITEM_INFERNAL_PICKAXE_OR_UNCHARGED = new ItemMapping(Item.itemId('INFERNAL_PICKAXE_UNCHARGED'), Item.itemId('INFERNAL_PICKAXE_UNCHARGED_25369'));
	itemMappings.ITEM_INFERNAL_AXE_OR = new ItemMapping(Item.itemId('INFERNAL_AXE'), Item.itemId('INFERNAL_AXE_OR'));
	itemMappings.ITEM_INFERNAL_AXE_OR_UNCHARGED = new ItemMapping(Item.itemId('INFERNAL_AXE_UNCHARGED'), Item.itemId('INFERNAL_AXE_UNCHARGED_25371'));
	itemMappings.ITEM_INFERNAL_HARPOON_OR = new ItemMapping(Item.itemId('INFERNAL_HARPOON'), Item.itemId('INFERNAL_HARPOON_OR'));
	itemMappings.ITEM_INFERNAL_HARPOON_OR_UNCHARGED = new ItemMapping(Item.itemId('INFERNAL_HARPOON_UNCHARGED'), Item.itemId('INFERNAL_HARPOON_UNCHARGED_25367'));
	itemMappings.ITEM_TRAILBLAZER_TOOL_ORNAMENT_KIT = new ItemMapping(Item.itemId('TRAILBLAZER_TOOL_ORNAMENT_KIT'), Item.itemId('DRAGON_PICKAXE_OR_25376'), Item.itemId('DRAGON_AXE_OR'), Item.itemId('DRAGON_HARPOON_OR'), Item.itemId('INFERNAL_PICKAXE_OR'), Item.itemId('INFERNAL_AXE_OR'), Item.itemId('INFERNAL_HARPOON_OR'), Item.itemId('INFERNAL_PICKAXE_UNCHARGED_25369'), Item.itemId('INFERNAL_AXE_UNCHARGED_25371'), Item.itemId('INFERNAL_HARPOON_UNCHARGED_25367'));
	itemMappings.ITEM_DRAGON_KITESHIELD = new ItemMapping(Item.itemId('DRAGON_KITESHIELD'), Item.itemId('DRAGON_KITESHIELD_G'));
	itemMappings.ITEM_DRAGON_KITESHIELD_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_KITESHIELD_ORNAMENT_KIT'), Item.itemId('DRAGON_KITESHIELD_G'));
	itemMappings.ITEM_DRAGON_FULL_HELM = new ItemMapping(Item.itemId('DRAGON_FULL_HELM'), Item.itemId('DRAGON_FULL_HELM_G'));
	itemMappings.ITEM_DRAGON_FULL_HELM_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_FULL_HELM_ORNAMENT_KIT'), Item.itemId('DRAGON_FULL_HELM_G'));
	itemMappings.ITEM_DRAGON_MED_HELM = new ItemMapping(Item.itemId('DRAGON_MED_HELM'), Item.itemId('DRAGON_MED_HELM_CR'));
	itemMappings.ITEM_DRAGON_CHAINBODY = new ItemMapping(Item.itemId('DRAGON_CHAINBODY_3140'), Item.itemId('DRAGON_CHAINBODY_G'), Item.itemId('DRAGON_CHAINBODY_CR'));
	itemMappings.ITEM_DRAGON_CHAINBODY_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_CHAINBODY_ORNAMENT_KIT'), Item.itemId('DRAGON_CHAINBODY_G'));
	itemMappings.ITEM_DRAGON_PLATEBODY = new ItemMapping(Item.itemId('DRAGON_PLATEBODY'), Item.itemId('DRAGON_PLATEBODY_G'));
	itemMappings.ITEM_DRAGON_PLATEBODY_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_PLATEBODY_ORNAMENT_KIT'), Item.itemId('DRAGON_PLATEBODY_G'));
	itemMappings.ITEM_DRAGON_PLATESKIRT = new ItemMapping(Item.itemId('DRAGON_PLATESKIRT'), Item.itemId('DRAGON_PLATESKIRT_G'), Item.itemId('DRAGON_PLATESKIRT_CR'));
	itemMappings.ITEM_DRAGON_SKIRT_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_LEGSSKIRT_ORNAMENT_KIT'), Item.itemId('DRAGON_PLATESKIRT_G'));
	itemMappings.ITEM_DRAGON_PLATELEGS = new ItemMapping(Item.itemId('DRAGON_PLATELEGS'), Item.itemId('DRAGON_PLATELEGS_G'), Item.itemId('DRAGON_PLATELEGS_CR'));
	itemMappings.ITEM_DRAGON_LEGS_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_LEGSSKIRT_ORNAMENT_KIT'), Item.itemId('DRAGON_PLATELEGS_G'));
	itemMappings.ITEM_DRAGON_SQ_SHIELD = new ItemMapping(Item.itemId('DRAGON_SQ_SHIELD'), Item.itemId('DRAGON_SQ_SHIELD_G'), Item.itemId('DRAGON_SQ_SHIELD_CR'));
	itemMappings.ITEM_DRAGON_SQ_SHIELD_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_SQ_SHIELD_ORNAMENT_KIT'), Item.itemId('DRAGON_SQ_SHIELD_G'));
	itemMappings.ITEM_DRAGON_BOOTS = new ItemMapping(Item.itemId('DRAGON_BOOTS'), Item.itemId('DRAGON_BOOTS_G'), Item.itemId('DRAGON_BOOTS_CR'));
	itemMappings.ITEM_DRAGON_BOOTS_ORNAMENT_KIT = new ItemMapping(Item.itemId('DRAGON_BOOTS_ORNAMENT_KIT'), Item.itemId('DRAGON_BOOTS_G'));

	// Rune ornament kits
	itemMappings.ITEM_RUNE_SCIMITAR_GUTHIX = new ItemMapping(Item.itemId('RUNE_SCIMITAR'), Item.itemId('RUNE_SCIMITAR_23330'));
	itemMappings.ITEM_RUNE_SCIMITAR_ORNAMENT_KIT_GUTHIX = new ItemMapping(Item.itemId('RUNE_SCIMITAR_ORNAMENT_KIT_GUTHIX'), Item.itemId('RUNE_SCIMITAR_23330'));
	itemMappings.ITEM_RUNE_SCIMITAR_SARADOMIN = new ItemMapping(Item.itemId('RUNE_SCIMITAR'), Item.itemId('RUNE_SCIMITAR_23332'));
	itemMappings.ITEM_RUNE_SCIMITAR_ORNAMENT_KIT_SARADOMIN = new ItemMapping(Item.itemId('RUNE_SCIMITAR_ORNAMENT_KIT_SARADOMIN'), Item.itemId('RUNE_SCIMITAR_23332'));
	itemMappings.ITEM_RUNE_SCIMITAR_ZAMORAK = new ItemMapping(Item.itemId('RUNE_SCIMITAR'), Item.itemId('RUNE_SCIMITAR_23334'));
	itemMappings.ITEM_RUNE_SCIMITAR_ORNAMENT_KIT_ZAMORAK = new ItemMapping(Item.itemId('RUNE_SCIMITAR_ORNAMENT_KIT_ZAMORAK'), Item.itemId('RUNE_SCIMITAR_23334'));
	itemMappings.ITEM_RUNE_DEFENDER = new ItemMapping(Item.itemId('RUNE_DEFENDER'), Item.itemId('RUNE_DEFENDER_T'), Item.itemId('RUNE_DEFENDER_LT'));
	itemMappings.ITEM_RUNE_DEFENDER_ORNAMENT_KIT = new ItemMapping(Item.itemId('RUNE_DEFENDER_ORNAMENT_KIT'), Item.itemId('RUNE_DEFENDER_T'), Item.itemId('RUNE_DEFENDER_LT'));
	itemMappings.ITEM_RUNE_CROSSBOW = new ItemMapping(Item.itemId('RUNE_CROSSBOW'), Item.itemId('RUNE_CROSSBOW_OR'));

	// Godsword ornament kits
	itemMappings.ITEM_ARMADYL_GODSWORD = new ItemMapping(Item.itemId('ARMADYL_GODSWORD'), Item.itemId('ARMADYL_GODSWORD_OR'));
	itemMappings.ITEM_ARMADYL_GODSWORD_ORNAMENT_KIT = new ItemMapping(Item.itemId('ARMADYL_GODSWORD_ORNAMENT_KIT'), Item.itemId('ARMADYL_GODSWORD_OR'));
	itemMappings.ITEM_BANDOS_GODSWORD = new ItemMapping(Item.itemId('BANDOS_GODSWORD'), Item.itemId('BANDOS_GODSWORD_OR'));
	itemMappings.ITEM_BANDOS_GODSWORD_ORNAMENT_KIT = new ItemMapping(Item.itemId('BANDOS_GODSWORD_ORNAMENT_KIT'), Item.itemId('BANDOS_GODSWORD_OR'));
	itemMappings.ITEM_ZAMORAK_GODSWORD = new ItemMapping(Item.itemId('ZAMORAK_GODSWORD'), Item.itemId('ZAMORAK_GODSWORD_OR'));
	itemMappings.ITEM_ZAMORAK_GODSWORD_ORNAMENT_KIT = new ItemMapping(Item.itemId('ZAMORAK_GODSWORD_ORNAMENT_KIT'), Item.itemId('ZAMORAK_GODSWORD_OR'));
	itemMappings.ITEM_SARADOMIN_GODSWORD = new ItemMapping(Item.itemId('SARADOMIN_GODSWORD'), Item.itemId('SARADOMIN_GODSWORD_OR'));
	itemMappings.ITEM_SARADOMIN_GODSWORD_ORNAMENT_KIT = new ItemMapping(Item.itemId('SARADOMIN_GODSWORD_ORNAMENT_KIT'), Item.itemId('SARADOMIN_GODSWORD_OR'));

	// Jewellery ornament kits
	itemMappings.ITEM_AMULET_OF_TORTURE = new ItemMapping(Item.itemId('AMULET_OF_TORTURE'), Item.itemId('AMULET_OF_TORTURE_OR'));
	itemMappings.ITEM_TORTURE_ORNAMENT_KIT = new ItemMapping(Item.itemId('TORTURE_ORNAMENT_KIT'), Item.itemId('AMULET_OF_TORTURE_OR'));
	itemMappings.ITEM_NECKLACE_OF_ANGUISH = new ItemMapping(Item.itemId('NECKLACE_OF_ANGUISH'), Item.itemId('NECKLACE_OF_ANGUISH_OR'));
	itemMappings.ITEM_ANGUISH_ORNAMENT_KIT = new ItemMapping(Item.itemId('ANGUISH_ORNAMENT_KIT'), Item.itemId('NECKLACE_OF_ANGUISH_OR'));
	itemMappings.ITEM_OCCULT_NECKLACE = new ItemMapping(Item.itemId('OCCULT_NECKLACE'), Item.itemId('OCCULT_NECKLACE_OR'));
	itemMappings.ITEM_OCCULT_ORNAMENT_KIT = new ItemMapping(Item.itemId('OCCULT_ORNAMENT_KIT'), Item.itemId('OCCULT_NECKLACE_OR'));
	itemMappings.ITEM_AMULET_OF_FURY = new ItemMapping(Item.itemId('AMULET_OF_FURY'), Item.itemId('AMULET_OF_FURY_OR'), Item.itemId('AMULET_OF_BLOOD_FURY'));
	itemMappings.ITEM_FURY_ORNAMENT_KIT = new ItemMapping(Item.itemId('FURY_ORNAMENT_KIT'), Item.itemId('AMULET_OF_FURY_OR'));
	itemMappings.ITEM_TORMENTED_BRACELET = new ItemMapping(Item.itemId('TORMENTED_BRACELET'), Item.itemId('TORMENTED_BRACELET_OR'));
	itemMappings.ITEM_TORMENTED_ORNAMENT_KIT = new ItemMapping(Item.itemId('TORMENTED_ORNAMENT_KIT'), Item.itemId('TORMENTED_BRACELET_OR'));
	itemMappings.ITEM_BERSERKER_NECKLACE = new ItemMapping(Item.itemId('BERSERKER_NECKLACE'), Item.itemId('BERSERKER_NECKLACE_OR'));
	itemMappings.ITEM_BERSERKER_NECKLACE_ORNAMENT_KIT = new ItemMapping(Item.itemId('BERSERKER_NECKLACE_ORNAMENT_KIT'), Item.itemId('BERSERKER_NECKLACE_OR'));

	// Other ornament kits
	itemMappings.ITEM_SHATTERED_RELICS_VARIETY_ORNAMENT_KIT = new ItemMapping(Item.itemId('SHATTERED_RELICS_VARIETY_ORNAMENT_KIT'), Item.itemId('RUNE_CROSSBOW_OR'), Item.itemId('ABYSSAL_TENTACLE_OR'), Item.itemId('ABYSSAL_WHIP_OR'), Item.itemId('BOOK_OF_BALANCE_OR'), Item.itemId('BOOK_OF_DARKNESS_OR'), Item.itemId('BOOK_OF_LAW_OR'), Item.itemId('BOOK_OF_WAR_OR'), Item.itemId('HOLY_BOOK_OR'), Item.itemId('UNHOLY_BOOK_OR'));
	itemMappings.ITEM_SHATTERED_RELICS_VOID_ORNAMENT_KIT = new ItemMapping(Item.itemId('SHATTERED_RELICS_VOID_ORNAMENT_KIT'), Item.itemId('ELITE_VOID_TOP_OR'), Item.itemId('ELITE_VOID_ROBE_OR'), Item.itemId('VOID_KNIGHT_TOP_OR'), Item.itemId('VOID_KNIGHT_ROBE_OR'), Item.itemId('VOID_KNIGHT_GLOVES_OR'), Item.itemId('VOID_MAGE_HELM_OR'), Item.itemId('VOID_MELEE_HELM_OR'), Item.itemId('VOID_RANGER_HELM_OR'), Item.itemId('VOID_KNIGHT_TOP_LOR'), Item.itemId('VOID_KNIGHT_ROBE_LOR'), Item.itemId('VOID_KNIGHT_GLOVES_LOR'), Item.itemId('ELITE_VOID_TOP_LOR'), Item.itemId('ELITE_VOID_ROBE_LOR'), Item.itemId('VOID_MAGE_HELM_LOR'), Item.itemId('VOID_RANGER_HELM_LOR'), Item.itemId('VOID_MELEE_HELM_LOR'));
	itemMappings.ITEM_MYSTIC_BOOTS = new ItemMapping(Item.itemId('MYSTIC_BOOTS'), Item.itemId('MYSTIC_BOOTS_OR'));
	itemMappings.ITEM_MYSTIC_GLOVES = new ItemMapping(Item.itemId('MYSTIC_GLOVES'), Item.itemId('MYSTIC_GLOVES_OR'));
	itemMappings.ITEM_MYSTIC_HAT = new ItemMapping(Item.itemId('MYSTIC_HAT'), Item.itemId('MYSTIC_HAT_OR'));
	itemMappings.ITEM_MYSTIC_ROBE_BOTTOM = new ItemMapping(Item.itemId('MYSTIC_ROBE_BOTTOM'), Item.itemId('MYSTIC_ROBE_BOTTOM_OR'));
	itemMappings.ITEM_MYSTIC_ROBE_TOP = new ItemMapping(Item.itemId('MYSTIC_ROBE_TOP'), Item.itemId('MYSTIC_ROBE_TOP_OR'));
	itemMappings.ITEM_SHATTERED_RELICS_MYSTIC_ORNAMENT_KIT = new ItemMapping(Item.itemId('SHATTERED_RELICS_MYSTIC_ORNAMENT_KIT'), Item.itemId('MYSTIC_BOOTS_OR'), Item.itemId('MYSTIC_GLOVES_OR'), Item.itemId('MYSTIC_HAT_OR'), Item.itemId('MYSTIC_ROBE_BOTTOM_OR'), Item.itemId('MYSTIC_ROBE_TOP_OR'));
	itemMappings.ITEM_CANNON_BARRELS = new ItemMapping(Item.itemId('CANNON_BARRELS'), Item.itemId('CANNON_BARRELS_OR'));
	itemMappings.ITEM_CANNON_BASE = new ItemMapping(Item.itemId('CANNON_BASE'), Item.itemId('CANNON_BASE_OR'));
	itemMappings.ITEM_CANNON_FURNACE = new ItemMapping(Item.itemId('CANNON_FURNACE'), Item.itemId('CANNON_FURNACE_OR'));
	itemMappings.ITEM_CANNON_STAND = new ItemMapping(Item.itemId('CANNON_STAND'), Item.itemId('CANNON_STAND_OR'));
	itemMappings.ITEM_SHATTERED_CANNON_ORNAMENT_KIT = new ItemMapping(Item.itemId('SHATTERED_CANNON_ORNAMENT_KIT'), Item.itemId('CANNON_BARRELS_OR'), Item.itemId('CANNON_BASE_OR'), Item.itemId('CANNON_FURNACE_OR'), Item.itemId('CANNON_STAND_OR'));
	itemMappings.ITEM_ELDER_MAUL = new ItemMapping(Item.itemId('ELDER_MAUL'), Item.itemId('ELDER_MAUL_OR'));
	itemMappings.ITEM_HEAVY_BALLISTA = new ItemMapping(Item.itemId('HEAVY_BALLISTA'), Item.itemId('HEAVY_BALLISTA_OR'));
	itemMappings.ITEM_ELDER_CHAOS_HOOD = new ItemMapping(Item.itemId('ELDER_CHAOS_HOOD'), Item.itemId('ELDER_CHAOS_HOOD_OR'));
	itemMappings.ITEM_ELDER_CHAOS_TOP = new ItemMapping(Item.itemId('ELDER_CHAOS_TOP'), Item.itemId('ELDER_CHAOS_TOP_OR'));
	itemMappings.ITEM_ELDER_CHAOS_ROBE = new ItemMapping(Item.itemId('ELDER_CHAOS_ROBE'), Item.itemId('ELDER_CHAOS_ROBE_OR'));

	// Ensouled heads
	itemMappings.ITEM_ENSOULED_GOBLIN_HEAD = new ItemMapping(Item.itemId('ENSOULED_GOBLIN_HEAD_13448'), Item.itemId('ENSOULED_GOBLIN_HEAD'));
	itemMappings.ITEM_ENSOULED_MONKEY_HEAD = new ItemMapping(Item.itemId('ENSOULED_MONKEY_HEAD_13451'), Item.itemId('ENSOULED_MONKEY_HEAD'));
	itemMappings.ITEM_ENSOULED_IMP_HEAD = new ItemMapping(Item.itemId('ENSOULED_IMP_HEAD_13454'), Item.itemId('ENSOULED_IMP_HEAD'));
	itemMappings.ITEM_ENSOULED_MINOTAUR_HEAD = new ItemMapping(Item.itemId('ENSOULED_MINOTAUR_HEAD_13457'), Item.itemId('ENSOULED_MINOTAUR_HEAD'));
	itemMappings.ITEM_ENSOULED_SCORPION_HEAD = new ItemMapping(Item.itemId('ENSOULED_SCORPION_HEAD_13460'), Item.itemId('ENSOULED_SCORPION_HEAD'));
	itemMappings.ITEM_ENSOULED_BEAR_HEAD = new ItemMapping(Item.itemId('ENSOULED_BEAR_HEAD_13463'), Item.itemId('ENSOULED_BEAR_HEAD'));
	itemMappings.ITEM_ENSOULED_UNICORN_HEAD = new ItemMapping(Item.itemId('ENSOULED_UNICORN_HEAD_13466'), Item.itemId('ENSOULED_UNICORN_HEAD'));
	itemMappings.ITEM_ENSOULED_DOG_HEAD = new ItemMapping(Item.itemId('ENSOULED_DOG_HEAD_13469'), Item.itemId('ENSOULED_DOG_HEAD'));
	itemMappings.ITEM_ENSOULED_CHAOS_DRUID_HEAD = new ItemMapping(Item.itemId('ENSOULED_CHAOS_DRUID_HEAD_13472'), Item.itemId('ENSOULED_CHAOS_DRUID_HEAD'));
	itemMappings.ITEM_ENSOULED_GIANT_HEAD = new ItemMapping(Item.itemId('ENSOULED_GIANT_HEAD_13475'), Item.itemId('ENSOULED_GIANT_HEAD'));
	itemMappings.ITEM_ENSOULED_OGRE_HEAD = new ItemMapping(Item.itemId('ENSOULED_OGRE_HEAD_13478'), Item.itemId('ENSOULED_OGRE_HEAD'));
	itemMappings.ITEM_ENSOULED_ELF_HEAD = new ItemMapping(Item.itemId('ENSOULED_ELF_HEAD_13481'), Item.itemId('ENSOULED_ELF_HEAD'));
	itemMappings.ITEM_ENSOULED_TROLL_HEAD = new ItemMapping(Item.itemId('ENSOULED_TROLL_HEAD_13484'), Item.itemId('ENSOULED_TROLL_HEAD'));
	itemMappings.ITEM_ENSOULED_HORROR_HEAD = new ItemMapping(Item.itemId('ENSOULED_HORROR_HEAD_13487'), Item.itemId('ENSOULED_HORROR_HEAD'));
	itemMappings.ITEM_ENSOULED_KALPHITE_HEAD = new ItemMapping(Item.itemId('ENSOULED_KALPHITE_HEAD_13490'), Item.itemId('ENSOULED_KALPHITE_HEAD'));
	itemMappings.ITEM_ENSOULED_DAGANNOTH_HEAD = new ItemMapping(Item.itemId('ENSOULED_DAGANNOTH_HEAD_13493'), Item.itemId('ENSOULED_DAGANNOTH_HEAD'));
	itemMappings.ITEM_ENSOULED_BLOODVELD_HEAD = new ItemMapping(Item.itemId('ENSOULED_BLOODVELD_HEAD_13496'), Item.itemId('ENSOULED_BLOODVELD_HEAD'));
	itemMappings.ITEM_ENSOULED_TZHAAR_HEAD = new ItemMapping(Item.itemId('ENSOULED_TZHAAR_HEAD_13499'), Item.itemId('ENSOULED_TZHAAR_HEAD'));
	itemMappings.ITEM_ENSOULED_DEMON_HEAD = new ItemMapping(Item.itemId('ENSOULED_DEMON_HEAD_13502'), Item.itemId('ENSOULED_DEMON_HEAD'));
	itemMappings.ITEM_ENSOULED_HELLHOUND_HEAD = new ItemMapping(Item.itemId('ENSOULED_HELLHOUND_HEAD_26997'), Item.itemId('ENSOULED_HELLHOUND_HEAD'));
	itemMappings.ITEM_ENSOULED_AVIANSIE_HEAD = new ItemMapping(Item.itemId('ENSOULED_AVIANSIE_HEAD_13505'), Item.itemId('ENSOULED_AVIANSIE_HEAD'));
	itemMappings.ITEM_ENSOULED_ABYSSAL_HEAD = new ItemMapping(Item.itemId('ENSOULED_ABYSSAL_HEAD_13508'), Item.itemId('ENSOULED_ABYSSAL_HEAD'));
	itemMappings.ITEM_ENSOULED_DRAGON_HEAD = new ItemMapping(Item.itemId('ENSOULED_DRAGON_HEAD_13511'), Item.itemId('ENSOULED_DRAGON_HEAD'));

	// Imbued rings
	itemMappings.ITEM_BERSERKER_RING = new ItemMapping(Item.itemId('BERSERKER_RING'), true, 1, Item.itemId('BERSERKER_RING_I'));
	itemMappings.ITEM_SEERS_RING = new ItemMapping(Item.itemId('SEERS_RING'), true, 1, Item.itemId('SEERS_RING_I'));
	itemMappings.ITEM_WARRIOR_RING = new ItemMapping(Item.itemId('WARRIOR_RING'), true, 1, Item.itemId('WARRIOR_RING_I'));
	itemMappings.ITEM_ARCHERS_RING = new ItemMapping(Item.itemId('ARCHERS_RING'), true, 1, Item.itemId('ARCHERS_RING_I'));
	itemMappings.ITEM_TREASONOUS_RING = new ItemMapping(Item.itemId('TREASONOUS_RING'), true, 1, Item.itemId('TREASONOUS_RING_I'));
	itemMappings.ITEM_TYRANNICAL_RING = new ItemMapping(Item.itemId('TYRANNICAL_RING'), true, 1, Item.itemId('TYRANNICAL_RING_I'));
	itemMappings.ITEM_RING_OF_THE_GODS = new ItemMapping(Item.itemId('RING_OF_THE_GODS'), true, 1, Item.itemId('RING_OF_THE_GODS_I'));
	itemMappings.ITEM_RING_OF_SUFFERING = new ItemMapping(Item.itemId('RING_OF_SUFFERING'), true, 1, Item.itemId('RING_OF_SUFFERING_I'));
	itemMappings.ITEM_GRANITE_RING = new ItemMapping(Item.itemId('GRANITE_RING'), true, 1, Item.itemId('GRANITE_RING_I'));

	// Bounty hunter
	itemMappings.ITEM_GRANITE_MAUL = new ItemMapping(Item.itemId('GRANITE_MAUL'), Item.itemId('GRANITE_MAUL_12848'));
	itemMappings.ITEM_MAGIC_SHORTBOW = new ItemMapping(Item.itemId('MAGIC_SHORTBOW'), Item.itemId('MAGIC_SHORTBOW_I'));
	itemMappings.ITEM_MAGIC_SHORTBOW_SCROLL = new ItemMapping(Item.itemId('MAGIC_SHORTBOW_SCROLL'), Item.itemId('MAGIC_SHORTBOW_I'));
	itemMappings.ITEM_SARADOMINS_BLESSED_SWORD = new ItemMapping(Item.itemId('SARADOMINS_TEAR'), Item.itemId('SARADOMINS_BLESSED_SWORD'));
	itemMappings.ITEM_ABYSSAL_DAGGER = new ItemMapping(Item.itemId('ABYSSAL_DAGGER'), Item.itemId('ABYSSAL_DAGGER_BH'));
	itemMappings.ITEM_DRAGON_LONGSWORD = new ItemMapping(Item.itemId('DRAGON_LONGSWORD'), Item.itemId('DRAGON_LONGSWORD_BH'), Item.itemId('DRAGON_LONGSWORD_CR'));
	itemMappings.ITEM_DRAGON_MACE = new ItemMapping(Item.itemId('DRAGON_MACE'), Item.itemId('DRAGON_MACE_BH'), Item.itemId('DRAGON_MACE_CR'));

	// Jewellery with charges
	itemMappings.ITEM_RING_OF_WEALTH = new ItemMapping(Item.itemId('RING_OF_WEALTH'), true, 1, Item.itemId('RING_OF_WEALTH_1'));
	itemMappings.ITEM_RING_OF_WEALTH_SCROLL = new ItemMapping(Item.itemId('RING_OF_WEALTH_SCROLL'), Item.itemId('RING_OF_WEALTH_I'), Item.itemId('RING_OF_WEALTH_I1'), Item.itemId('RING_OF_WEALTH_I2'), Item.itemId('RING_OF_WEALTH_I3'), Item.itemId('RING_OF_WEALTH_I4'), Item.itemId('RING_OF_WEALTH_I5'));
	itemMappings.ITEM_AMULET_OF_GLORY = new ItemMapping(Item.itemId('AMULET_OF_GLORY'), Item.itemId('AMULET_OF_GLORY1'), Item.itemId('AMULET_OF_GLORY2'), Item.itemId('AMULET_OF_GLORY3'), Item.itemId('AMULET_OF_GLORY5'));
	itemMappings.ITEM_AMULET_OF_GLORY_T = new ItemMapping(Item.itemId('AMULET_OF_GLORY_T'), Item.itemId('AMULET_OF_GLORY_T1'), Item.itemId('AMULET_OF_GLORY_T2'), Item.itemId('AMULET_OF_GLORY_T3'), Item.itemId('AMULET_OF_GLORY_T5'));
	itemMappings.ITEM_SKILLS_NECKLACE = new ItemMapping(Item.itemId('SKILLS_NECKLACE'), Item.itemId('SKILLS_NECKLACE1'), Item.itemId('SKILLS_NECKLACE2'), Item.itemId('SKILLS_NECKLACE3'), Item.itemId('SKILLS_NECKLACE5'));
	itemMappings.ITEM_RING_OF_DUELING = new ItemMapping(Item.itemId('RING_OF_DUELING8'), Item.itemId('RING_OF_DUELING1'), Item.itemId('RING_OF_DUELING2'), Item.itemId('RING_OF_DUELING3'), Item.itemId('RING_OF_DUELING4'), Item.itemId('RING_OF_DUELING5'), Item.itemId('RING_OF_DUELING6'), Item.itemId('RING_OF_DUELING7'));
	itemMappings.ITEM_GAMES_NECKLACE = new ItemMapping(Item.itemId('GAMES_NECKLACE8'), Item.itemId('GAMES_NECKLACE1'), Item.itemId('GAMES_NECKLACE2'), Item.itemId('GAMES_NECKLACE3'), Item.itemId('GAMES_NECKLACE4'), Item.itemId('GAMES_NECKLACE5'), Item.itemId('GAMES_NECKLACE6'), Item.itemId('GAMES_NECKLACE7'));

	// Degradable/charged weaponry/armour
	itemMappings.ITEM_ABYSSAL_WHIP = new ItemMapping(Item.itemId('ABYSSAL_WHIP'), Item.itemId('VOLCANIC_ABYSSAL_WHIP'), Item.itemId('FROZEN_ABYSSAL_WHIP'), Item.itemId('ABYSSAL_WHIP_OR'));
	itemMappings.ITEM_KRAKEN_TENTACLE = new ItemMapping(Item.itemId('KRAKEN_TENTACLE'), Item.itemId('ABYSSAL_TENTACLE'), Item.itemId('ABYSSAL_TENTACLE_OR'));
	itemMappings.ITEM_TRIDENT_OF_THE_SEAS = new ItemMapping(Item.itemId('UNCHARGED_TRIDENT'), Item.itemId('TRIDENT_OF_THE_SEAS'));
	itemMappings.ITEM_TRIDENT_OF_THE_SEAS_E = new ItemMapping(Item.itemId('UNCHARGED_TRIDENT_E'), Item.itemId('TRIDENT_OF_THE_SEAS_E'));
	itemMappings.ITEM_TRIDENT_OF_THE_SWAMP = new ItemMapping(Item.itemId('UNCHARGED_TOXIC_TRIDENT'), Item.itemId('TRIDENT_OF_THE_SWAMP'));
	itemMappings.ITEM_TRIDENT_OF_THE_SWAMP_E = new ItemMapping(Item.itemId('UNCHARGED_TOXIC_TRIDENT_E'), Item.itemId('TRIDENT_OF_THE_SWAMP_E'));
	itemMappings.ITEM_TOXIC_BLOWPIPE = new ItemMapping(Item.itemId('TOXIC_BLOWPIPE_EMPTY'), Item.itemId('TOXIC_BLOWPIPE'));
	itemMappings.ITEM_TOXIC_STAFF_OFF_THE_DEAD = new ItemMapping(Item.itemId('TOXIC_STAFF_UNCHARGED'), Item.itemId('TOXIC_STAFF_OF_THE_DEAD'));
	itemMappings.ITEM_SERPENTINE_HELM = new ItemMapping(Item.itemId('SERPENTINE_HELM_UNCHARGED'), Item.itemId('SERPENTINE_HELM'), Item.itemId('TANZANITE_HELM_UNCHARGED'), Item.itemId('TANZANITE_HELM'), Item.itemId('MAGMA_HELM_UNCHARGED'), Item.itemId('MAGMA_HELM'));
	itemMappings.ITEM_DRAGONFIRE_SHIELD = new ItemMapping(Item.itemId('DRAGONFIRE_SHIELD_11284'), Item.itemId('DRAGONFIRE_SHIELD'));
	itemMappings.ITEM_DRAGONFIRE_WARD = new ItemMapping(Item.itemId('DRAGONFIRE_WARD_22003'), Item.itemId('DRAGONFIRE_WARD'));
	itemMappings.ITEM_ANCIENT_WYVERN_SHIELD = new ItemMapping(Item.itemId('ANCIENT_WYVERN_SHIELD_21634'), Item.itemId('ANCIENT_WYVERN_SHIELD'));
	itemMappings.ITEM_SANGUINESTI_STAFF = new ItemMapping(Item.itemId('SANGUINESTI_STAFF_UNCHARGED'), Item.itemId('SANGUINESTI_STAFF'), Item.itemId('HOLY_SANGUINESTI_STAFF_UNCHARGED'), Item.itemId('HOLY_SANGUINESTI_STAFF'));
	itemMappings.ITEM_SCYTHE_OF_VITUR = new ItemMapping(Item.itemId('SCYTHE_OF_VITUR_UNCHARGED'), Item.itemId('SCYTHE_OF_VITUR'), Item.itemId('HOLY_SCYTHE_OF_VITUR_UNCHARGED'), Item.itemId('HOLY_SCYTHE_OF_VITUR'), Item.itemId('SANGUINE_SCYTHE_OF_VITUR_UNCHARGED'), Item.itemId('SANGUINE_SCYTHE_OF_VITUR'));
	itemMappings.ITEM_TOME_OF_FIRE = new ItemMapping(Item.itemId('TOME_OF_FIRE_EMPTY'), Item.itemId('TOME_OF_FIRE'));
	itemMappings.ITEM_TOME_OF_WATER = new ItemMapping(Item.itemId('TOME_OF_WATER_EMPTY'), Item.itemId('TOME_OF_WATER'));
	itemMappings.ITEM_CRAWS_BOW = new ItemMapping(Item.itemId('CRAWS_BOW_U'), Item.itemId('CRAWS_BOW'));
	itemMappings.ITEM_VIGGORAS_CHAINMACE = new ItemMapping(Item.itemId('VIGGORAS_CHAINMACE_U'), Item.itemId('VIGGORAS_CHAINMACE'));
	itemMappings.ITEM_THAMMARONS_SCEPTRE = new ItemMapping(Item.itemId('THAMMARONS_SCEPTRE_U'), Item.itemId('THAMMARONS_SCEPTRE'));
	itemMappings.ITEM_WEBWEAVER_BOW = new ItemMapping(Item.itemId('WEBWEAVER_BOW_U'), Item.itemId('WEBWEAVER_BOW'));
	itemMappings.ITEM_URSINE_CHAINMACE = new ItemMapping(Item.itemId('URSINE_CHAINMACE_U'), Item.itemId('URSINE_CHAINMACE'));
	itemMappings.ITEM_ACCURSED_SCEPTRE = new ItemMapping(Item.itemId('ACCURSED_SCEPTRE_U'), Item.itemId('ACCURSED_SCEPTRE'));
	itemMappings.ITEM_ACCURSED_SCEPTRE_A = new ItemMapping(Item.itemId('ACCURSED_SCEPTRE_AU'), Item.itemId('ACCURSED_SCEPTRE_A'));
	itemMappings.ITEM_BRYOPHYTAS_STAFF = new ItemMapping(Item.itemId('BRYOPHYTAS_STAFF_UNCHARGED'), Item.itemId('BRYOPHYTAS_STAFF'));
	itemMappings.ITEM_RING_OF_ENDURANCE = new ItemMapping(Item.itemId('RING_OF_ENDURANCE_UNCHARGED_24844'), Item.itemId('RING_OF_ENDURANCE'));
	itemMappings.ITEM_TUMEKENS_SHADOW = new ItemMapping(Item.itemId('TUMEKENS_SHADOW_UNCHARGED'), Item.itemId('TUMEKENS_SHADOW'));
	itemMappings.ITEM_PHARAOHS_SCEPTRE = new ItemMapping(Item.itemId('PHARAOHS_SCEPTRE_UNCHARGED'), true, 1, Item.itemId('PHARAOHS_SCEPTRE'));
	itemMappings.ITEM_VENATOR_BOW = new ItemMapping(Item.itemId('VENATOR_BOW_UNCHARGED'), Item.itemId('VENATOR_BOW'));

	// Tombs of Amascut gear
	itemMappings.ITEM_ELIDINIS_WARD = new ItemMapping(Item.itemId('ELIDINIS_WARD'), Item.itemId('ELIDINIS_WARD_F'), Item.itemId('ELIDINIS_WARD_OR'));
	itemMappings.ITEM_OSMUMTENS_FANG = new ItemMapping(Item.itemId('OSMUMTENS_FANG'), Item.itemId('OSMUMTENS_FANG_OR'));

	// Infinity colour kits
	itemMappings.ITEM_INFINITY_TOP = new ItemMapping(Item.itemId('INFINITY_TOP'), Item.itemId('INFINITY_TOP_20574'), Item.itemId('DARK_INFINITY_TOP'), Item.itemId('LIGHT_INFINITY_TOP'));
	itemMappings.ITEM_INFINITY_TOP_LIGHT_COLOUR_KIT = new ItemMapping(Item.itemId('LIGHT_INFINITY_COLOUR_KIT'), Item.itemId('LIGHT_INFINITY_TOP'));
	itemMappings.ITEM_INFINITY_TOP_DARK_COLOUR_KIT = new ItemMapping(Item.itemId('DARK_INFINITY_COLOUR_KIT'), Item.itemId('DARK_INFINITY_TOP'));
	itemMappings.ITEM_INFINITY_BOTTOMS = new ItemMapping(Item.itemId('INFINITY_BOTTOMS'), Item.itemId('INFINITY_BOTTOMS_20575'), Item.itemId('DARK_INFINITY_BOTTOMS'), Item.itemId('LIGHT_INFINITY_BOTTOMS'));
	itemMappings.ITEM_INFINITY_BOTTOMS_LIGHT_COLOUR_KIT = new ItemMapping(Item.itemId('LIGHT_INFINITY_COLOUR_KIT'), Item.itemId('LIGHT_INFINITY_BOTTOMS'));
	itemMappings.ITEM_INFINITY_BOTTOMS_DARK_COLOUR_KIT = new ItemMapping(Item.itemId('DARK_INFINITY_COLOUR_KIT'), Item.itemId('DARK_INFINITY_BOTTOMS'));
	itemMappings.ITEM_INFINITY_HAT = new ItemMapping(Item.itemId('INFINITY_HAT'), Item.itemId('DARK_INFINITY_HAT'), Item.itemId('LIGHT_INFINITY_HAT'));
	itemMappings.ITEM_INFINITY_HAT_LIGHT_COLOUR_KIT = new ItemMapping(Item.itemId('LIGHT_INFINITY_COLOUR_KIT'), Item.itemId('LIGHT_INFINITY_HAT'));
	itemMappings.ITEM_INFINITY_HAT_DARK_COLOUR_KIT = new ItemMapping(Item.itemId('DARK_INFINITY_COLOUR_KIT'), Item.itemId('DARK_INFINITY_HAT'));

	// Miscellaneous ornament kits
	itemMappings.ITEM_DARK_BOW = new ItemMapping(Item.itemId('DARK_BOW'), Item.itemId('DARK_BOW_12765'), Item.itemId('DARK_BOW_12766'), Item.itemId('DARK_BOW_12767'), Item.itemId('DARK_BOW_12768'), Item.itemId('DARK_BOW_20408'), Item.itemId('DARK_BOW_BH'));
	itemMappings.ITEM_ODIUM_WARD = new ItemMapping(Item.itemId('ODIUM_WARD'), Item.itemId('ODIUM_WARD_12807'));
	itemMappings.ITEM_MALEDICTION_WARD = new ItemMapping(Item.itemId('MALEDICTION_WARD'), Item.itemId('MALEDICTION_WARD_12806'));
	itemMappings.ITEM_STEAM_BATTLESTAFF = new ItemMapping(Item.itemId('STEAM_BATTLESTAFF'), Item.itemId('STEAM_BATTLESTAFF_12795'));
	itemMappings.ITEM_LAVA_BATTLESTAFF = new ItemMapping(Item.itemId('LAVA_BATTLESTAFF'), Item.itemId('LAVA_BATTLESTAFF_21198'));
	itemMappings.ITEM_TZHAARKETOM = new ItemMapping(Item.itemId('TZHAARKETOM'), Item.itemId('TZHAARKETOM_T'));
	itemMappings.ITEM_TZHAARKETOM_ORNAMENT_KIT = new ItemMapping(Item.itemId('TZHAARKETOM_ORNAMENT_KIT'), Item.itemId('TZHAARKETOM_T'));
	itemMappings.ITEM_DRAGON_HUNTER_CROSSBOW = new ItemMapping(Item.itemId('DRAGON_HUNTER_CROSSBOW'), Item.itemId('DRAGON_HUNTER_CROSSBOW_B'), Item.itemId('DRAGON_HUNTER_CROSSBOW_T'));

	// Slayer helm/black mask
	itemMappings.ITEM_BLACK_MASK = new ItemMapping(Item.itemId('BLACK_MASK'), true, 1, Item.itemId('BLACK_MASK'), Item.itemId('SLAYER_HELMET'));

	// Revertible items
	itemMappings.ITEM_HYDRA_LEATHER = new ItemMapping(Item.itemId('HYDRA_LEATHER'), Item.itemId('FEROCIOUS_GLOVES'));
	itemMappings.ITEM_HYDRA_TAIL = new ItemMapping(Item.itemId('HYDRA_TAIL'), Item.itemId('BONECRUSHER_NECKLACE'));
	itemMappings.ITEM_DRAGONBONE_NECKLACE = new ItemMapping(Item.itemId('DRAGONBONE_NECKLACE'), Item.itemId('BONECRUSHER_NECKLACE'));
	itemMappings.ITEM_BOTTOMLESS_COMPOST_BUCKET = new ItemMapping(Item.itemId('BOTTOMLESS_COMPOST_BUCKET'), Item.itemId('BOTTOMLESS_COMPOST_BUCKET_22997'));
	itemMappings.ITEM_BASILISK_JAW = new ItemMapping(Item.itemId('BASILISK_JAW'), Item.itemId('NEITIZNOT_FACEGUARD'));
	itemMappings.ITEM_HELM_OF_NEITIZNOT = new ItemMapping(Item.itemId('HELM_OF_NEITIZNOT'), Item.itemId('NEITIZNOT_FACEGUARD'), Item.itemId('HELM_OF_NEITIZNOT_OR'));
	itemMappings.ITEM_TWISTED_HORNS = new ItemMapping(Item.itemId('TWISTED_HORNS'), Item.itemId('TWISTED_SLAYER_HELMET'), Item.itemId('TWISTED_SLAYER_HELMET_I'), Item.itemId('TWISTED_SLAYER_HELMET_I_25191'), Item.itemId('TWISTED_SLAYER_HELMET_I_26681'));
	itemMappings.ITEM_ELDRITCH_ORB = new ItemMapping(Item.itemId('ELDRITCH_ORB'), Item.itemId('ELDRITCH_NIGHTMARE_STAFF'));
	itemMappings.ITEM_HARMONISED_ORB = new ItemMapping(Item.itemId('HARMONISED_ORB'), Item.itemId('HARMONISED_NIGHTMARE_STAFF'));
	itemMappings.ITEM_VOLATILE_ORB = new ItemMapping(Item.itemId('VOLATILE_ORB'), Item.itemId('VOLATILE_NIGHTMARE_STAFF'));
	itemMappings.ITEM_NIGHTMARE_STAFF = new ItemMapping(Item.itemId('NIGHTMARE_STAFF'), Item.itemId('ELDRITCH_NIGHTMARE_STAFF'), Item.itemId('HARMONISED_NIGHTMARE_STAFF'), Item.itemId('VOLATILE_NIGHTMARE_STAFF'));
	itemMappings.ITEM_GHARZI_RAPIER = new ItemMapping(Item.itemId('GHRAZI_RAPIER'), Item.itemId('HOLY_GHRAZI_RAPIER'));
	itemMappings.ITEM_MASTER_SCROLL_BOOK = new ItemMapping(Item.itemId('MASTER_SCROLL_BOOK_EMPTY'), Item.itemId('MASTER_SCROLL_BOOK'));
	itemMappings.ITEM_ARCANE_SIGIL = new ItemMapping(Item.itemId('ARCANE_SIGIL'), Item.itemId('ELIDINIS_WARD_F'), Item.itemId('ELIDINIS_WARD_OR'));

	// Trouver Parchment
	itemMappings.ITEM_TROUVER_PARCHMENT = new ItemMapping(Item.itemId('TROUVER_PARCHMENT'), Item.itemId('INFERNAL_MAX_CAPE_L'), Item.itemId('FIRE_MAX_CAPE_L'), Item.itemId('ASSEMBLER_MAX_CAPE_L'), Item.itemId('BRONZE_DEFENDER_L'), Item.itemId('IRON_DEFENDER_L'), Item.itemId('STEEL_DEFENDER_L'), Item.itemId('BLACK_DEFENDER_L'), Item.itemId('MITHRIL_DEFENDER_L'), Item.itemId('ADAMANT_DEFENDER_L'),
		RUNE_DEFENDER_L, Item.itemId('DRAGON_DEFENDER_L'), Item.itemId('DECORATIVE_SWORD_L'), Item.itemId('DECORATIVE_ARMOUR_L'), Item.itemId('DECORATIVE_ARMOUR_L_24159'), Item.itemId('DECORATIVE_HELM_L'), Item.itemId('DECORATIVE_SHIELD_L'), Item.itemId('DECORATIVE_ARMOUR_L_24162'), Item.itemId('DECORATIVE_ARMOUR_L_24163'), Item.itemId('DECORATIVE_ARMOUR_L_24164'),
		DECORATIVE_ARMOUR_L_24165, Item.itemId('DECORATIVE_ARMOUR_L_24166'), Item.itemId('DECORATIVE_ARMOUR_L_24167'), Item.itemId('DECORATIVE_ARMOUR_L_24168'), Item.itemId('SARADOMIN_HALO_L'), Item.itemId('ZAMORAK_HALO_L'), Item.itemId('GUTHIX_HALO_L'), Item.itemId('HEALER_HAT_L'), Item.itemId('FIGHTER_HAT_L'), Item.itemId('RANGER_HAT_L'),
		FIGHTER_TORSO_L, Item.itemId('PENANCE_SKIRT_L'), Item.itemId('VOID_KNIGHT_TOP_L'), Item.itemId('ELITE_VOID_TOP_L'), Item.itemId('VOID_KNIGHT_ROBE_L'), Item.itemId('ELITE_VOID_ROBE_L'), Item.itemId('VOID_KNIGHT_MACE_L'), Item.itemId('VOID_KNIGHT_GLOVES_L'), Item.itemId('VOID_MAGE_HELM_L'), Item.itemId('VOID_RANGER_HELM_L'),
		VOID_MELEE_HELM_L, Item.itemId('AVERNIC_DEFENDER_L'), Item.itemId('ARMADYL_HALO_L'), Item.itemId('BANDOS_HALO_L'), Item.itemId('SEREN_HALO_L'), Item.itemId('ANCIENT_HALO_L'), Item.itemId('BRASSICA_HALO_L'), Item.itemId('AVAS_ASSEMBLER_L'), Item.itemId('FIRE_CAPE_L'), Item.itemId('INFERNAL_CAPE_L'), Item.itemId('IMBUED_SARADOMIN_MAX_CAPE_L'),
		IMBUED_ZAMORAK_MAX_CAPE_L, Item.itemId('IMBUED_GUTHIX_MAX_CAPE_L'), Item.itemId('IMBUED_SARADOMIN_CAPE_L'), Item.itemId('IMBUED_ZAMORAK_CAPE_L'), Item.itemId('IMBUED_GUTHIX_CAPE_L'), Item.itemId('RUNE_POUCH_L'), Item.itemId('RUNNER_HAT_L'), Item.itemId('DECORATIVE_BOOTS_L'), Item.itemId('DECORATIVE_FULL_HELM_L'),
		MASORI_ASSEMBLER_L, Item.itemId('MASORI_ASSEMBLER_MAX_CAPE_L'), Item.itemId('RUNE_DEFENDER_LT'), Item.itemId('VOID_KNIGHT_TOP_LOR'), Item.itemId('VOID_KNIGHT_ROBE_LOR'), Item.itemId('VOID_KNIGHT_GLOVES_LOR'), Item.itemId('ELITE_VOID_TOP_LOR'), Item.itemId('ELITE_VOID_ROBE_LOR'), Item.itemId('VOID_MAGE_HELM_LOR'),
		VOID_RANGER_HELM_LOR, Item.itemId('VOID_MELEE_HELM_LOR'), Item.itemId('BARRONITE_MACE_L'));

	itemMappings.ITEM_TROUVER_PARCHMENT_REFUND_LARGE = new ItemMapping(Item.itemId('COINS_995'), 475000, Item.itemId('INFERNAL_MAX_CAPE_L'), Item.itemId('FIRE_MAX_CAPE_L'), Item.itemId('ASSEMBLER_MAX_CAPE_L'), Item.itemId('RUNE_DEFENDER_L'), Item.itemId('DRAGON_DEFENDER_L'), Item.itemId('DECORATIVE_SWORD_L'), Item.itemId('DECORATIVE_ARMOUR_L'), Item.itemId('DECORATIVE_ARMOUR_L_24159'), Item.itemId('DECORATIVE_HELM_L'), Item.itemId('DECORATIVE_SHIELD_L'),
		DECORATIVE_ARMOUR_L_24162, Item.itemId('DECORATIVE_ARMOUR_L_24163'), Item.itemId('DECORATIVE_ARMOUR_L_24164'), Item.itemId('DECORATIVE_ARMOUR_L_24165'), Item.itemId('DECORATIVE_ARMOUR_L_24166'), Item.itemId('DECORATIVE_ARMOUR_L_24167'), Item.itemId('DECORATIVE_ARMOUR_L_24168'), Item.itemId('SARADOMIN_HALO_L'),
		ZAMORAK_HALO_L, Item.itemId('GUTHIX_HALO_L'), Item.itemId('HEALER_HAT_L'), Item.itemId('FIGHTER_HAT_L'), Item.itemId('RANGER_HAT_L'), Item.itemId('FIGHTER_TORSO_L'), Item.itemId('PENANCE_SKIRT_L'), Item.itemId('VOID_KNIGHT_TOP_L'), Item.itemId('ELITE_VOID_TOP_L'), Item.itemId('VOID_KNIGHT_ROBE_L'), Item.itemId('ELITE_VOID_ROBE_L'), Item.itemId('VOID_KNIGHT_MACE_L'),
		VOID_KNIGHT_GLOVES_L, Item.itemId('VOID_MAGE_HELM_L'), Item.itemId('VOID_RANGER_HELM_L'), Item.itemId('VOID_MELEE_HELM_L'), Item.itemId('AVERNIC_DEFENDER_L'), Item.itemId('ARMADYL_HALO_L'), Item.itemId('BANDOS_HALO_L'), Item.itemId('SEREN_HALO_L'), Item.itemId('ANCIENT_HALO_L'), Item.itemId('BRASSICA_HALO_L'), Item.itemId('AVAS_ASSEMBLER_L'),
		FIRE_CAPE_L, Item.itemId('INFERNAL_CAPE_L'), Item.itemId('IMBUED_SARADOMIN_MAX_CAPE_L'), Item.itemId('IMBUED_ZAMORAK_MAX_CAPE_L'), Item.itemId('IMBUED_GUTHIX_MAX_CAPE_L'), Item.itemId('IMBUED_SARADOMIN_CAPE_L'), Item.itemId('IMBUED_ZAMORAK_CAPE_L'), Item.itemId('IMBUED_GUTHIX_CAPE_L'), Item.itemId('RUNE_POUCH_L'), Item.itemId('RUNNER_HAT_L'), Item.itemId('DECORATIVE_BOOTS_L'), Item.itemId('DECORATIVE_FULL_HELM_L'),
		MASORI_ASSEMBLER_L, Item.itemId('MASORI_ASSEMBLER_MAX_CAPE_L'), Item.itemId('RUNE_DEFENDER_LT'), Item.itemId('VOID_KNIGHT_TOP_LOR'), Item.itemId('VOID_KNIGHT_ROBE_LOR'), Item.itemId('VOID_KNIGHT_GLOVES_LOR'), Item.itemId('ELITE_VOID_TOP_LOR'), Item.itemId('ELITE_VOID_ROBE_LOR'), Item.itemId('VOID_MAGE_HELM_LOR'),
		VOID_RANGER_HELM_LOR, Item.itemId('VOID_MELEE_HELM_LOR'), Item.itemId('BARRONITE_MACE_L'));
	itemMappings.ITEM_TROUVER_PARCHMENT_REFUND_SMALL = new ItemMapping(Item.itemId('COINS_995'), 47500, Item.itemId('BRONZE_DEFENDER_L'), Item.itemId('IRON_DEFENDER_L'), Item.itemId('STEEL_DEFENDER_L'), Item.itemId('BLACK_DEFENDER_L'), Item.itemId('MITHRIL_DEFENDER_L'), Item.itemId('ADAMANT_DEFENDER_L'));

	// Crystal items
	itemMappings.ITEM_CRYSTAL_TOOL_SEED = new ItemMapping(Item.itemId('CRYSTAL_TOOL_SEED'), Item.itemId('CRYSTAL_AXE'), Item.itemId('CRYSTAL_AXE_INACTIVE'), Item.itemId('CRYSTAL_HARPOON'), Item.itemId('CRYSTAL_HARPOON_INACTIVE'), Item.itemId('CRYSTAL_PICKAXE'), Item.itemId('CRYSTAL_PICKAXE_INACTIVE'));
	itemMappings.ITEM_CRYSTAL_AXE = new ItemMapping(Item.itemId('DRAGON_AXE'), Item.itemId('CRYSTAL_AXE'), Item.itemId('CRYSTAL_AXE_INACTIVE'));
	itemMappings.ITEM_CRYSTAL_HARPOON = new ItemMapping(Item.itemId('DRAGON_HARPOON'), Item.itemId('CRYSTAL_HARPOON'), Item.itemId('CRYSTAL_HARPOON_INACTIVE'));
	itemMappings.ITEM_CRYSTAL_PICKAXE = new ItemMapping(Item.itemId('DRAGON_PICKAXE'), Item.itemId('CRYSTAL_PICKAXE'), Item.itemId('CRYSTAL_PICKAXE_INACTIVE'));
	itemMappings.ITEM_BLADE_OF_SAELDOR = new ItemMapping(Item.itemId('BLADE_OF_SAELDOR_INACTIVE'), true, 1, Item.itemId('BLADE_OF_SAELDOR'));
	itemMappings.ITEM_CRYSTAL_BOW = new ItemMapping(Item.itemId('CRYSTAL_WEAPON_SEED'), Item.itemId('CRYSTAL_BOW'), Item.itemId('CRYSTAL_BOW_24123'), Item.itemId('CRYSTAL_BOW_INACTIVE'));
	itemMappings.ITEM_CRYSTAL_HALBERD = new ItemMapping(Item.itemId('CRYSTAL_WEAPON_SEED'), Item.itemId('CRYSTAL_HALBERD'), Item.itemId('CRYSTAL_HALBERD_24125'), Item.itemId('CRYSTAL_HALBERD_INACTIVE'));
	itemMappings.ITEM_CRYSTAL_SHIELD = new ItemMapping(Item.itemId('CRYSTAL_WEAPON_SEED'), Item.itemId('CRYSTAL_SHIELD'), Item.itemId('CRYSTAL_SHIELD_24127'), Item.itemId('CRYSTAL_SHIELD_INACTIVE'));
	itemMappings.ITEM_CRYSTAL_HELMET = new ItemMapping(Item.itemId('CRYSTAL_ARMOUR_SEED'), true, 1, Item.itemId('CRYSTAL_HELM'));
	itemMappings.ITEM_CRYSTAL_LEGS = new ItemMapping(Item.itemId('CRYSTAL_ARMOUR_SEED'), true, 2, Item.itemId('CRYSTAL_LEGS'));
	itemMappings.ITEM_CRYSTAL_BODY = new ItemMapping(Item.itemId('CRYSTAL_ARMOUR_SEED'), true, 3, Item.itemId('CRYSTAL_BODY'));
	itemMappings.ITEM_BOW_OF_FAERDHINEN = new ItemMapping(Item.itemId('BOW_OF_FAERDHINEN_INACTIVE'), true, 1, Item.itemId('BOW_OF_FAERDHINEN'));

	// Bird nests
	itemMappings.ITEM_BIRD_NEST = new ItemMapping(Item.itemId('BIRD_NEST_5075'), Item.itemId('BIRD_NEST'), Item.itemId('BIRD_NEST_5071'), Item.itemId('BIRD_NEST_5072'), Item.itemId('BIRD_NEST_5073'), Item.itemId('BIRD_NEST_5074'), Item.itemId('BIRD_NEST_7413'), Item.itemId('BIRD_NEST_13653'), Item.itemId('BIRD_NEST_22798'), Item.itemId('BIRD_NEST_22800'), Item.itemId('CLUE_NEST_EASY'), Item.itemId('CLUE_NEST_MEDIUM'), Item.itemId('CLUE_NEST_HARD'), Item.itemId('CLUE_NEST_ELITE'));

	// Ancestral robes
	itemMappings.ITEM_ANCESTRAL_HAT = new ItemMapping(Item.itemId('ANCESTRAL_HAT'), Item.itemId('TWISTED_ANCESTRAL_HAT'));
	itemMappings.ITEM_ANCESTRAL_ROBE_TOP = new ItemMapping(Item.itemId('ANCESTRAL_ROBE_TOP'), Item.itemId('TWISTED_ANCESTRAL_ROBE_TOP'));
	itemMappings.ITEM_ANCESTRAL_ROBE_BOTTOM = new ItemMapping(Item.itemId('ANCESTRAL_ROBE_BOTTOM'), Item.itemId('TWISTED_ANCESTRAL_ROBE_BOTTOM'));

	// Torva armor
	itemMappings.ITEM_TORVA_FULL_HELM = new ItemMapping(Item.itemId('TORVA_FULL_HELM'), Item.itemId('SANGUINE_TORVA_FULL_HELM'));
	itemMappings.ITEM_TORVA_PLATEBODY = new ItemMapping(Item.itemId('TORVA_PLATEBODY'), Item.itemId('SANGUINE_TORVA_PLATEBODY'));
	itemMappings.ITEM_TORVA_PLATELEGS = new ItemMapping(Item.itemId('TORVA_PLATELEGS'), Item.itemId('SANGUINE_TORVA_PLATELEGS'));

	// Graceful
	itemMappings.ITEM_MARK_OF_GRACE = new ItemMapping(Item.itemId('AMYLASE_CRYSTAL'), true, 10, Item.itemId('MARK_OF_GRACE'));
	itemMappings.ITEM_GRACEFUL_HOOD = new ItemMapping(Item.itemId('MARK_OF_GRACE'), true, 28, Item.itemId('GRACEFUL_HOOD'));
	itemMappings.ITEM_GRACEFUL_TOP = new ItemMapping(Item.itemId('MARK_OF_GRACE'), true, 44, Item.itemId('GRACEFUL_TOP'));
	itemMappings.ITEM_GRACEFUL_LEGS = new ItemMapping(Item.itemId('MARK_OF_GRACE'), true, 48, Item.itemId('GRACEFUL_LEGS'));
	itemMappings.ITEM_GRACEFUL_GLOVES = new ItemMapping(Item.itemId('MARK_OF_GRACE'), true, 24, Item.itemId('GRACEFUL_GLOVES'));
	itemMappings.ITEM_GRACEFUL_BOOTS = new ItemMapping(Item.itemId('MARK_OF_GRACE'), true, 32, Item.itemId('GRACEFUL_BOOTS'));
	itemMappings.ITEM_GRACEFUL_CAPE = new ItemMapping(Item.itemId('MARK_OF_GRACE'), true, 32, Item.itemId('GRACEFUL_CAPE'));

	// Trailblazer Graceful Ornament Kit
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_HOOD = new ItemMapping(Item.itemId('TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'), Item.itemId('GRACEFUL_HOOD_25069'));
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_TOP = new ItemMapping(Item.itemId('TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'), Item.itemId('GRACEFUL_TOP_25075'));
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_LEGS = new ItemMapping(Item.itemId('TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'), Item.itemId('GRACEFUL_LEGS_25078'));
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_GLOVES = new ItemMapping(Item.itemId('TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'), Item.itemId('GRACEFUL_GLOVES_25081'));
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_BOOTS = new ItemMapping(Item.itemId('TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'), Item.itemId('GRACEFUL_BOOTS_25084'));
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_CAPE = new ItemMapping(Item.itemId('TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'), Item.itemId('GRACEFUL_CAPE_25072'));

	// 10 golden nuggets = 100 soft clay
	itemMappings.ITEM_GOLDEN_NUGGET = new ItemMapping(Item.itemId('SOFT_CLAY'), true, 10, Item.itemId('GOLDEN_NUGGET'));
	itemMappings.ITEM_PROSPECTOR_HELMET = new ItemMapping(Item.itemId('GOLDEN_NUGGET'), true, 32, Item.itemId('PROSPECTOR_HELMET'));
	itemMappings.ITEM_PROSPECTOR_JACKET = new ItemMapping(Item.itemId('GOLDEN_NUGGET'), true, 48, Item.itemId('PROSPECTOR_JACKET'));
	itemMappings.ITEM_PROSPECTOR_LEGS = new ItemMapping(Item.itemId('GOLDEN_NUGGET'), true, 40, Item.itemId('PROSPECTOR_LEGS'));
	itemMappings.ITEM_PROSPECTOR_BOOTS = new ItemMapping(Item.itemId('GOLDEN_NUGGET'), true, 24, Item.itemId('PROSPECTOR_BOOTS'));

	// 10 unidentified minerals = 100 soft clay
	itemMappings.ITEM_UNIDENTIFIED_MINERALS = new ItemMapping(Item.itemId('SOFT_CLAY'), true, 10, Item.itemId('UNIDENTIFIED_MINERALS'));

	// Converted to coins
	itemMappings.ITEM_TATTERED_PAGE = new ItemMapping(Item.itemId('COINS_995'), true, 1000, Item.itemId('TATTERED_MOON_PAGE'), Item.itemId('TATTERED_SUN_PAGE'), Item.itemId('TATTERED_TEMPLE_PAGE'));
	itemMappings.ITEM_LONG_BONE = new ItemMapping(Item.itemId('COINS_995'), true, 1000, Item.itemId('LONG_BONE'));
	itemMappings.ITEM_CURVED_BONE = new ItemMapping(Item.itemId('COINS_995'), true, 2000, Item.itemId('CURVED_BONE'));
	itemMappings.ITEM_PERFECT_SHELL = new ItemMapping(Item.itemId('COINS_995'), true, 600, Item.itemId('PERFECT_SHELL'));
	itemMappings.ITEM_PERFECT_SNAIL_SHELL = new ItemMapping(Item.itemId('COINS_995'), true, 600, Item.itemId('PERFECT_SNAIL_SHELL'));
	itemMappings.ITEM_SNAIL_SHELL = new ItemMapping(Item.itemId('COINS_995'), true, 600, Item.itemId('SNAIL_SHELL'));
	itemMappings.ITEM_TORTOISE_SHELL = new ItemMapping(Item.itemId('COINS_995'), true, 250, Item.itemId('TORTOISE_SHELL'));

	
export { itemMappings };