import { ItemData } from "./item-data";

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

export class ItemMappingList {
	static mapping() {
		const itemMappings = {};

	// Barrows equipment
	itemMappings.ITEM_AHRIMS_HOOD = new ItemMapping(ItemData.runeliteKeyList()['AHRIMS_HOOD'], ItemData.runeliteKeyList()['AHRIMS_HOOD_25'], ItemData.runeliteKeyList()['AHRIMS_HOOD_50'], ItemData.runeliteKeyList()['AHRIMS_HOOD_75'], ItemData.runeliteKeyList()['AHRIMS_HOOD_100']);
	itemMappings.ITEM_AHRIMS_ROBETOP = new ItemMapping(ItemData.runeliteKeyList()['AHRIMS_ROBETOP'], ItemData.runeliteKeyList()['AHRIMS_ROBETOP_25'], ItemData.runeliteKeyList()['AHRIMS_ROBETOP_50'], ItemData.runeliteKeyList()['AHRIMS_ROBETOP_75'], ItemData.runeliteKeyList()['AHRIMS_ROBETOP_100']);
	itemMappings.ITEM_AHRIMS_ROBEBOTTOM = new ItemMapping(ItemData.runeliteKeyList()['AHRIMS_ROBESKIRT'], ItemData.runeliteKeyList()['AHRIMS_ROBESKIRT_25'], ItemData.runeliteKeyList()['AHRIMS_ROBESKIRT_50'], ItemData.runeliteKeyList()['AHRIMS_ROBESKIRT_75'], ItemData.runeliteKeyList()['AHRIMS_ROBESKIRT_100']);
	itemMappings.ITEM_AHRIMS_STAFF = new ItemMapping(ItemData.runeliteKeyList()['AHRIMS_STAFF'], ItemData.runeliteKeyList()['AHRIMS_STAFF_25'], ItemData.runeliteKeyList()['AHRIMS_STAFF_50'], ItemData.runeliteKeyList()['AHRIMS_STAFF_75'], ItemData.runeliteKeyList()['AHRIMS_STAFF_100']);
	itemMappings.ITEM_KARILS_COIF = new ItemMapping(ItemData.runeliteKeyList()['KARILS_COIF'], ItemData.runeliteKeyList()['KARILS_COIF_25'], ItemData.runeliteKeyList()['KARILS_COIF_50'], ItemData.runeliteKeyList()['KARILS_COIF_75'], ItemData.runeliteKeyList()['KARILS_COIF_100']);
	itemMappings.ITEM_KARILS_LEATHERTOP = new ItemMapping(ItemData.runeliteKeyList()['KARILS_LEATHERTOP'], ItemData.runeliteKeyList()['KARILS_LEATHERTOP_25'], ItemData.runeliteKeyList()['KARILS_LEATHERTOP_50'], ItemData.runeliteKeyList()['KARILS_LEATHERTOP_75'], ItemData.runeliteKeyList()['KARILS_LEATHERTOP_100']);
	itemMappings.ITEM_KARILS_LEATHERSKIRT = new ItemMapping(ItemData.runeliteKeyList()['KARILS_LEATHERSKIRT'], ItemData.runeliteKeyList()['KARILS_LEATHERSKIRT_25'], ItemData.runeliteKeyList()['KARILS_LEATHERSKIRT_50'], ItemData.runeliteKeyList()['KARILS_LEATHERSKIRT_75'], ItemData.runeliteKeyList()['KARILS_LEATHERSKIRT_100']);
	itemMappings.ITEM_KARILS_CROSSBOW = new ItemMapping(ItemData.runeliteKeyList()['KARILS_CROSSBOW'], ItemData.runeliteKeyList()['KARILS_CROSSBOW_25'], ItemData.runeliteKeyList()['KARILS_CROSSBOW_50'], ItemData.runeliteKeyList()['KARILS_CROSSBOW_75'], ItemData.runeliteKeyList()['KARILS_CROSSBOW_100']);
	itemMappings.ITEM_DHAROKS_HELM = new ItemMapping(ItemData.runeliteKeyList()['DHAROKS_HELM'], ItemData.runeliteKeyList()['DHAROKS_HELM_25'], ItemData.runeliteKeyList()['DHAROKS_HELM_50'], ItemData.runeliteKeyList()['DHAROKS_HELM_75'], ItemData.runeliteKeyList()['DHAROKS_HELM_100']);
	itemMappings.ITEM_DHAROKS_PLATEBODY = new ItemMapping(ItemData.runeliteKeyList()['DHAROKS_PLATEBODY'], ItemData.runeliteKeyList()['DHAROKS_PLATEBODY_25'], ItemData.runeliteKeyList()['DHAROKS_PLATEBODY_50'], ItemData.runeliteKeyList()['DHAROKS_PLATEBODY_75'], ItemData.runeliteKeyList()['DHAROKS_PLATEBODY_100']);
	itemMappings.ITEM_DHAROKS_PLATELEGS = new ItemMapping(ItemData.runeliteKeyList()['DHAROKS_PLATELEGS'], ItemData.runeliteKeyList()['DHAROKS_PLATELEGS_25'], ItemData.runeliteKeyList()['DHAROKS_PLATELEGS_50'], ItemData.runeliteKeyList()['DHAROKS_PLATELEGS_75'], ItemData.runeliteKeyList()['DHAROKS_PLATELEGS_100']);
	itemMappings.ITEM_DHARKS_GREATEAXE = new ItemMapping(ItemData.runeliteKeyList()['DHAROKS_GREATAXE'], ItemData.runeliteKeyList()['DHAROKS_GREATAXE_25'], ItemData.runeliteKeyList()['DHAROKS_GREATAXE_50'], ItemData.runeliteKeyList()['DHAROKS_GREATAXE_75'], ItemData.runeliteKeyList()['DHAROKS_GREATAXE_100']);
	itemMappings.ITEM_GUTHANS_HELM = new ItemMapping(ItemData.runeliteKeyList()['GUTHANS_HELM'], ItemData.runeliteKeyList()['GUTHANS_HELM_25'], ItemData.runeliteKeyList()['GUTHANS_HELM_50'], ItemData.runeliteKeyList()['GUTHANS_HELM_75'], ItemData.runeliteKeyList()['GUTHANS_HELM_100']);
	itemMappings.ITEM_GUTHANS_PLATEBODY = new ItemMapping(ItemData.runeliteKeyList()['GUTHANS_PLATEBODY'], ItemData.runeliteKeyList()['GUTHANS_PLATEBODY_25'], ItemData.runeliteKeyList()['GUTHANS_PLATEBODY_50'], ItemData.runeliteKeyList()['GUTHANS_PLATEBODY_75'], ItemData.runeliteKeyList()['GUTHANS_PLATEBODY_100']);
	itemMappings.ITEM_GUTHANS_CHAINSKIRT = new ItemMapping(ItemData.runeliteKeyList()['GUTHANS_CHAINSKIRT'], ItemData.runeliteKeyList()['GUTHANS_CHAINSKIRT_25'], ItemData.runeliteKeyList()['GUTHANS_CHAINSKIRT_50'], ItemData.runeliteKeyList()['GUTHANS_CHAINSKIRT_75'], ItemData.runeliteKeyList()['GUTHANS_CHAINSKIRT_100']);
	itemMappings.ITEM_GUTHANS_WARSPEAR = new ItemMapping(ItemData.runeliteKeyList()['GUTHANS_WARSPEAR'], ItemData.runeliteKeyList()['GUTHANS_WARSPEAR_25'], ItemData.runeliteKeyList()['GUTHANS_WARSPEAR_50'], ItemData.runeliteKeyList()['GUTHANS_WARSPEAR_75'], ItemData.runeliteKeyList()['GUTHANS_WARSPEAR_100']);
	itemMappings.ITEM_TORAGS_HELM = new ItemMapping(ItemData.runeliteKeyList()['TORAGS_HELM'], ItemData.runeliteKeyList()['TORAGS_HELM_25'], ItemData.runeliteKeyList()['TORAGS_HELM_50'], ItemData.runeliteKeyList()['TORAGS_HELM_75'], ItemData.runeliteKeyList()['TORAGS_HELM_100']);
	itemMappings.ITEM_TORAGS_PLATEBODY = new ItemMapping(ItemData.runeliteKeyList()['TORAGS_PLATEBODY'], ItemData.runeliteKeyList()['TORAGS_PLATEBODY_25'], ItemData.runeliteKeyList()['TORAGS_PLATEBODY_50'], ItemData.runeliteKeyList()['TORAGS_PLATEBODY_75'], ItemData.runeliteKeyList()['TORAGS_PLATEBODY_100']);
	itemMappings.ITEM_TORAGS_PLATELEGS = new ItemMapping(ItemData.runeliteKeyList()['TORAGS_PLATELEGS'], ItemData.runeliteKeyList()['TORAGS_PLATELEGS_25'], ItemData.runeliteKeyList()['TORAGS_PLATELEGS_50'], ItemData.runeliteKeyList()['TORAGS_PLATELEGS_75'], ItemData.runeliteKeyList()['TORAGS_PLATELEGS_100']);
	itemMappings.ITEM_TORAGS_HAMMERS = new ItemMapping(ItemData.runeliteKeyList()['TORAGS_HAMMERS'], ItemData.runeliteKeyList()['TORAGS_HAMMERS_25'], ItemData.runeliteKeyList()['TORAGS_HAMMERS_50'], ItemData.runeliteKeyList()['TORAGS_HAMMERS_75'], ItemData.runeliteKeyList()['TORAGS_HAMMERS_100']);
	itemMappings.ITEM_VERACS_HELM = new ItemMapping(ItemData.runeliteKeyList()['VERACS_HELM'], ItemData.runeliteKeyList()['VERACS_HELM_25'], ItemData.runeliteKeyList()['VERACS_HELM_50'], ItemData.runeliteKeyList()['VERACS_HELM_75'], ItemData.runeliteKeyList()['VERACS_HELM_100']);
	itemMappings.ITEM_VERACS_BRASSARD = new ItemMapping(ItemData.runeliteKeyList()['VERACS_BRASSARD'], ItemData.runeliteKeyList()['VERACS_BRASSARD_25'], ItemData.runeliteKeyList()['VERACS_BRASSARD_50'], ItemData.runeliteKeyList()['VERACS_BRASSARD_75'], ItemData.runeliteKeyList()['VERACS_BRASSARD_100']);
	itemMappings.ITEM_VERACS_PLATESKIRT = new ItemMapping(ItemData.runeliteKeyList()['VERACS_PLATESKIRT'], ItemData.runeliteKeyList()['VERACS_PLATESKIRT_25'], ItemData.runeliteKeyList()['VERACS_PLATESKIRT_50'], ItemData.runeliteKeyList()['VERACS_PLATESKIRT_75'], ItemData.runeliteKeyList()['VERACS_PLATESKIRT_100']);
	itemMappings.ITEM_VERACS_FLAIL = new ItemMapping(ItemData.runeliteKeyList()['VERACS_FLAIL'], ItemData.runeliteKeyList()['VERACS_FLAIL_25'], ItemData.runeliteKeyList()['VERACS_FLAIL_50'], ItemData.runeliteKeyList()['VERACS_FLAIL_75'], ItemData.runeliteKeyList()['VERACS_FLAIL_100']);

	// Dragon equipment ornament kits
	itemMappings.ITEM_DRAGON_2H_SWORD = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_2H_SWORD'], ItemData.runeliteKeyList()['DRAGON_2H_SWORD_CR']);
	itemMappings.ITEM_DRAGON_BATTLEAXE = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_BATTLEAXE'], ItemData.runeliteKeyList()['DRAGON_BATTLEAXE_CR']);
	itemMappings.ITEM_DRAGON_CLAWS = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_CLAWS'], ItemData.runeliteKeyList()['DRAGON_CLAWS_CR']);
	itemMappings.ITEM_DRAGON_CROSSBOW = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_CROSSBOW'], ItemData.runeliteKeyList()['DRAGON_CROSSBOW_CR']);
	itemMappings.ITEM_DRAGON_DAGGER = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_DAGGER'], ItemData.runeliteKeyList()['DRAGON_DAGGER_CR']);
	itemMappings.ITEM_DRAGON_DAGGER_P = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_DAGGERP'], ItemData.runeliteKeyList()['DRAGON_DAGGER_PCR']);
	itemMappings.ITEM_DRAGON_DAGGER_P_ = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_DAGGERP_5680'], ItemData.runeliteKeyList()['DRAGON_DAGGER_PCR_28023']);
	itemMappings.ITEM_DRAGON_DAGGER_P__ = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_DAGGERP_5698'], ItemData.runeliteKeyList()['DRAGON_DAGGER_PCR_28025']);
	itemMappings.ITEM_DRAGON_HALBERD = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_HALBERD'], ItemData.runeliteKeyList()['DRAGON_HALBERD_CR']);
	// Dragon longsword and Dragon mace are included in "Bounty hunter" section
	itemMappings.ITEM_DRAGON_SCIMITAR = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SCIMITAR'], ItemData.runeliteKeyList()['DRAGON_SCIMITAR_OR'], ItemData.runeliteKeyList()['DRAGON_SCIMITAR_CR']);
	itemMappings.ITEM_DRAGON_SCIMITAR_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SCIMITAR_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_SCIMITAR_OR']);
	itemMappings.ITEM_DRAGON_SPEAR = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SPEAR'], ItemData.runeliteKeyList()['DRAGON_SPEAR_CR']);
	itemMappings.ITEM_DRAGON_SPEAR_P = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SPEARP'], ItemData.runeliteKeyList()['DRAGON_SPEAR_PCR']);
	itemMappings.ITEM_DRAGON_SPEAR_P_ = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SPEARP_5716'], ItemData.runeliteKeyList()['DRAGON_SPEAR_PCR_28045']);
	itemMappings.ITEM_DRAGON_SPEAR_P__ = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SPEARP_5730'], ItemData.runeliteKeyList()['DRAGON_SPEAR_PCR_28047']);
	itemMappings.ITEM_DRAGON_SWORD = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SWORD'], ItemData.runeliteKeyList()['DRAGON_SWORD_CR']);
	itemMappings.ITEM_DRAGON_WARHAMMER = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_WARHAMMER'], ItemData.runeliteKeyList()['DRAGON_WARHAMMER_CR']);
	itemMappings.ITEM_DRAGON_DEFENDER = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_DEFENDER_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_DEFENDER_T']);
	itemMappings.ITEM_DRAGON_PICKAXE = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_PICKAXE'], ItemData.runeliteKeyList()['DRAGON_PICKAXE_12797'], ItemData.runeliteKeyList()['DRAGON_PICKAXE_OR'], ItemData.runeliteKeyList()['DRAGON_PICKAXE_OR_25376']);
	itemMappings.ITEM_DRAGON_PICKAXE_OR = new ItemMapping(ItemData.runeliteKeyList()['ZALCANO_SHARD'], ItemData.runeliteKeyList()['DRAGON_PICKAXE_OR']);
	itemMappings.ITEM_DRAGON_AXE = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_AXE'], ItemData.runeliteKeyList()['DRAGON_AXE_OR']);
	itemMappings.ITEM_DRAGON_HARPOON = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_HARPOON'], ItemData.runeliteKeyList()['DRAGON_HARPOON_OR']);
	itemMappings.ITEM_INFERNAL_PICKAXE_OR = new ItemMapping(ItemData.runeliteKeyList()['INFERNAL_PICKAXE'], ItemData.runeliteKeyList()['INFERNAL_PICKAXE_OR']);
	itemMappings.ITEM_INFERNAL_PICKAXE_OR_UNCHARGED = new ItemMapping(ItemData.runeliteKeyList()['INFERNAL_PICKAXE_UNCHARGED'], ItemData.runeliteKeyList()['INFERNAL_PICKAXE_UNCHARGED_25369']);
	itemMappings.ITEM_INFERNAL_AXE_OR = new ItemMapping(ItemData.runeliteKeyList()['INFERNAL_AXE'], ItemData.runeliteKeyList()['INFERNAL_AXE_OR']);
	itemMappings.ITEM_INFERNAL_AXE_OR_UNCHARGED = new ItemMapping(ItemData.runeliteKeyList()['INFERNAL_AXE_UNCHARGED'], ItemData.runeliteKeyList()['INFERNAL_AXE_UNCHARGED_25371']);
	itemMappings.ITEM_INFERNAL_HARPOON_OR = new ItemMapping(ItemData.runeliteKeyList()['INFERNAL_HARPOON'], ItemData.runeliteKeyList()['INFERNAL_HARPOON_OR']);
	itemMappings.ITEM_INFERNAL_HARPOON_OR_UNCHARGED = new ItemMapping(ItemData.runeliteKeyList()['INFERNAL_HARPOON_UNCHARGED'], ItemData.runeliteKeyList()['INFERNAL_HARPOON_UNCHARGED_25367']);
	itemMappings.ITEM_TRAILBLAZER_TOOL_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['TRAILBLAZER_TOOL_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_PICKAXE_OR_25376'], ItemData.runeliteKeyList()['DRAGON_AXE_OR'], ItemData.runeliteKeyList()['DRAGON_HARPOON_OR'], ItemData.runeliteKeyList()['INFERNAL_PICKAXE_OR'], ItemData.runeliteKeyList()['INFERNAL_AXE_OR'], ItemData.runeliteKeyList()['INFERNAL_HARPOON_OR'], ItemData.runeliteKeyList()['INFERNAL_PICKAXE_UNCHARGED_25369'], ItemData.runeliteKeyList()['INFERNAL_AXE_UNCHARGED_25371'], ItemData.runeliteKeyList()['INFERNAL_HARPOON_UNCHARGED_25367']);
	itemMappings.ITEM_DRAGON_KITESHIELD = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_KITESHIELD'], ItemData.runeliteKeyList()['DRAGON_KITESHIELD_G']);
	itemMappings.ITEM_DRAGON_KITESHIELD_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_KITESHIELD_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_KITESHIELD_G']);
	itemMappings.ITEM_DRAGON_FULL_HELM = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_FULL_HELM'], ItemData.runeliteKeyList()['DRAGON_FULL_HELM_G']);
	itemMappings.ITEM_DRAGON_FULL_HELM_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_FULL_HELM_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_FULL_HELM_G']);
	itemMappings.ITEM_DRAGON_MED_HELM = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_MED_HELM'], ItemData.runeliteKeyList()['DRAGON_MED_HELM_CR']);
	itemMappings.ITEM_DRAGON_CHAINBODY = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_CHAINBODY_3140'], ItemData.runeliteKeyList()['DRAGON_CHAINBODY_G'], ItemData.runeliteKeyList()['DRAGON_CHAINBODY_CR']);
	itemMappings.ITEM_DRAGON_CHAINBODY_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_CHAINBODY_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_CHAINBODY_G']);
	itemMappings.ITEM_DRAGON_PLATEBODY = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_PLATEBODY'], ItemData.runeliteKeyList()['DRAGON_PLATEBODY_G']);
	itemMappings.ITEM_DRAGON_PLATEBODY_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_PLATEBODY_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_PLATEBODY_G']);
	itemMappings.ITEM_DRAGON_PLATESKIRT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_PLATESKIRT'], ItemData.runeliteKeyList()['DRAGON_PLATESKIRT_G'], ItemData.runeliteKeyList()['DRAGON_PLATESKIRT_CR']);
	itemMappings.ITEM_DRAGON_SKIRT_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_LEGSSKIRT_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_PLATESKIRT_G']);
	itemMappings.ITEM_DRAGON_PLATELEGS = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_PLATELEGS'], ItemData.runeliteKeyList()['DRAGON_PLATELEGS_G'], ItemData.runeliteKeyList()['DRAGON_PLATELEGS_CR']);
	itemMappings.ITEM_DRAGON_LEGS_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_LEGSSKIRT_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_PLATELEGS_G']);
	itemMappings.ITEM_DRAGON_SQ_SHIELD = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SQ_SHIELD'], ItemData.runeliteKeyList()['DRAGON_SQ_SHIELD_G'], ItemData.runeliteKeyList()['DRAGON_SQ_SHIELD_CR']);
	itemMappings.ITEM_DRAGON_SQ_SHIELD_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_SQ_SHIELD_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_SQ_SHIELD_G']);
	itemMappings.ITEM_DRAGON_BOOTS = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_BOOTS'], ItemData.runeliteKeyList()['DRAGON_BOOTS_G'], ItemData.runeliteKeyList()['DRAGON_BOOTS_CR']);
	itemMappings.ITEM_DRAGON_BOOTS_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_BOOTS_ORNAMENT_KIT'], ItemData.runeliteKeyList()['DRAGON_BOOTS_G']);

	// Rune ornament kits
	itemMappings.ITEM_RUNE_SCIMITAR_GUTHIX = new ItemMapping(ItemData.runeliteKeyList()['RUNE_SCIMITAR'], ItemData.runeliteKeyList()['RUNE_SCIMITAR_23330']);
	itemMappings.ITEM_RUNE_SCIMITAR_ORNAMENT_KIT_GUTHIX = new ItemMapping(ItemData.runeliteKeyList()['RUNE_SCIMITAR_ORNAMENT_KIT_GUTHIX'], ItemData.runeliteKeyList()['RUNE_SCIMITAR_23330']);
	itemMappings.ITEM_RUNE_SCIMITAR_SARADOMIN = new ItemMapping(ItemData.runeliteKeyList()['RUNE_SCIMITAR'], ItemData.runeliteKeyList()['RUNE_SCIMITAR_23332']);
	itemMappings.ITEM_RUNE_SCIMITAR_ORNAMENT_KIT_SARADOMIN = new ItemMapping(ItemData.runeliteKeyList()['RUNE_SCIMITAR_ORNAMENT_KIT_SARADOMIN'], ItemData.runeliteKeyList()['RUNE_SCIMITAR_23332']);
	itemMappings.ITEM_RUNE_SCIMITAR_ZAMORAK = new ItemMapping(ItemData.runeliteKeyList()['RUNE_SCIMITAR'], ItemData.runeliteKeyList()['RUNE_SCIMITAR_23334']);
	itemMappings.ITEM_RUNE_SCIMITAR_ORNAMENT_KIT_ZAMORAK = new ItemMapping(ItemData.runeliteKeyList()['RUNE_SCIMITAR_ORNAMENT_KIT_ZAMORAK'], ItemData.runeliteKeyList()['RUNE_SCIMITAR_23334']);
	itemMappings.ITEM_RUNE_DEFENDER = new ItemMapping(ItemData.runeliteKeyList()['RUNE_DEFENDER'], ItemData.runeliteKeyList()['RUNE_DEFENDER_T'], ItemData.runeliteKeyList()['RUNE_DEFENDER_LT']);
	itemMappings.ITEM_RUNE_DEFENDER_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['RUNE_DEFENDER_ORNAMENT_KIT'], ItemData.runeliteKeyList()['RUNE_DEFENDER_T'], ItemData.runeliteKeyList()['RUNE_DEFENDER_LT']);
	itemMappings.ITEM_RUNE_CROSSBOW = new ItemMapping(ItemData.runeliteKeyList()['RUNE_CROSSBOW'], ItemData.runeliteKeyList()['RUNE_CROSSBOW_OR']);

	// Godsword ornament kits
	itemMappings.ITEM_ARMADYL_GODSWORD = new ItemMapping(ItemData.runeliteKeyList()['ARMADYL_GODSWORD'], ItemData.runeliteKeyList()['ARMADYL_GODSWORD_OR']);
	itemMappings.ITEM_ARMADYL_GODSWORD_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['ARMADYL_GODSWORD_ORNAMENT_KIT'], ItemData.runeliteKeyList()['ARMADYL_GODSWORD_OR']);
	itemMappings.ITEM_BANDOS_GODSWORD = new ItemMapping(ItemData.runeliteKeyList()['BANDOS_GODSWORD'], ItemData.runeliteKeyList()['BANDOS_GODSWORD_OR']);
	itemMappings.ITEM_BANDOS_GODSWORD_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['BANDOS_GODSWORD_ORNAMENT_KIT'], ItemData.runeliteKeyList()['BANDOS_GODSWORD_OR']);
	itemMappings.ITEM_ZAMORAK_GODSWORD = new ItemMapping(ItemData.runeliteKeyList()['ZAMORAK_GODSWORD'], ItemData.runeliteKeyList()['ZAMORAK_GODSWORD_OR']);
	itemMappings.ITEM_ZAMORAK_GODSWORD_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['ZAMORAK_GODSWORD_ORNAMENT_KIT'], ItemData.runeliteKeyList()['ZAMORAK_GODSWORD_OR']);
	itemMappings.ITEM_SARADOMIN_GODSWORD = new ItemMapping(ItemData.runeliteKeyList()['SARADOMIN_GODSWORD'], ItemData.runeliteKeyList()['SARADOMIN_GODSWORD_OR']);
	itemMappings.ITEM_SARADOMIN_GODSWORD_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['SARADOMIN_GODSWORD_ORNAMENT_KIT'], ItemData.runeliteKeyList()['SARADOMIN_GODSWORD_OR']);

	// Jewellery ornament kits
	itemMappings.ITEM_AMULET_OF_TORTURE = new ItemMapping(ItemData.runeliteKeyList()['AMULET_OF_TORTURE'], ItemData.runeliteKeyList()['AMULET_OF_TORTURE_OR']);
	itemMappings.ITEM_TORTURE_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['TORTURE_ORNAMENT_KIT'], ItemData.runeliteKeyList()['AMULET_OF_TORTURE_OR']);
	itemMappings.ITEM_NECKLACE_OF_ANGUISH = new ItemMapping(ItemData.runeliteKeyList()['NECKLACE_OF_ANGUISH'], ItemData.runeliteKeyList()['NECKLACE_OF_ANGUISH_OR']);
	itemMappings.ITEM_ANGUISH_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['ANGUISH_ORNAMENT_KIT'], ItemData.runeliteKeyList()['NECKLACE_OF_ANGUISH_OR']);
	itemMappings.ITEM_OCCULT_NECKLACE = new ItemMapping(ItemData.runeliteKeyList()['OCCULT_NECKLACE'], ItemData.runeliteKeyList()['OCCULT_NECKLACE_OR']);
	itemMappings.ITEM_OCCULT_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['OCCULT_ORNAMENT_KIT'], ItemData.runeliteKeyList()['OCCULT_NECKLACE_OR']);
	itemMappings.ITEM_AMULET_OF_FURY = new ItemMapping(ItemData.runeliteKeyList()['AMULET_OF_FURY'], ItemData.runeliteKeyList()['AMULET_OF_FURY_OR'], ItemData.runeliteKeyList()['AMULET_OF_BLOOD_FURY']);
	itemMappings.ITEM_FURY_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['FURY_ORNAMENT_KIT'], ItemData.runeliteKeyList()['AMULET_OF_FURY_OR']);
	itemMappings.ITEM_TORMENTED_BRACELET = new ItemMapping(ItemData.runeliteKeyList()['TORMENTED_BRACELET'], ItemData.runeliteKeyList()['TORMENTED_BRACELET_OR']);
	itemMappings.ITEM_TORMENTED_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['TORMENTED_ORNAMENT_KIT'], ItemData.runeliteKeyList()['TORMENTED_BRACELET_OR']);
	itemMappings.ITEM_BERSERKER_NECKLACE = new ItemMapping(ItemData.runeliteKeyList()['BERSERKER_NECKLACE'], ItemData.runeliteKeyList()['BERSERKER_NECKLACE_OR']);
	itemMappings.ITEM_BERSERKER_NECKLACE_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['BERSERKER_NECKLACE_ORNAMENT_KIT'], ItemData.runeliteKeyList()['BERSERKER_NECKLACE_OR']);

	// Other ornament kits
	itemMappings.ITEM_SHATTERED_RELICS_VARIETY_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['SHATTERED_RELICS_VARIETY_ORNAMENT_KIT'], ItemData.runeliteKeyList()['RUNE_CROSSBOW_OR'], ItemData.runeliteKeyList()['ABYSSAL_TENTACLE_OR'], ItemData.runeliteKeyList()['ABYSSAL_WHIP_OR'], ItemData.runeliteKeyList()['BOOK_OF_BALANCE_OR'], ItemData.runeliteKeyList()['BOOK_OF_DARKNESS_OR'], ItemData.runeliteKeyList()['BOOK_OF_LAW_OR'], ItemData.runeliteKeyList()['BOOK_OF_WAR_OR'], ItemData.runeliteKeyList()['HOLY_BOOK_OR'], ItemData.runeliteKeyList()['UNHOLY_BOOK_OR']);
	itemMappings.ITEM_SHATTERED_RELICS_VOID_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['SHATTERED_RELICS_VOID_ORNAMENT_KIT'], ItemData.runeliteKeyList()['ELITE_VOID_TOP_OR'], ItemData.runeliteKeyList()['ELITE_VOID_ROBE_OR'], ItemData.runeliteKeyList()['VOID_KNIGHT_TOP_OR'], ItemData.runeliteKeyList()['VOID_KNIGHT_ROBE_OR'], ItemData.runeliteKeyList()['VOID_KNIGHT_GLOVES_OR'], ItemData.runeliteKeyList()['VOID_MAGE_HELM_OR'], ItemData.runeliteKeyList()['VOID_MELEE_HELM_OR'], ItemData.runeliteKeyList()['VOID_RANGER_HELM_OR'], ItemData.runeliteKeyList()['VOID_KNIGHT_TOP_LOR'], ItemData.runeliteKeyList()['VOID_KNIGHT_ROBE_LOR'], ItemData.runeliteKeyList()['VOID_KNIGHT_GLOVES_LOR'], ItemData.runeliteKeyList()['ELITE_VOID_TOP_LOR'], ItemData.runeliteKeyList()['ELITE_VOID_ROBE_LOR'], ItemData.runeliteKeyList()['VOID_MAGE_HELM_LOR'], ItemData.runeliteKeyList()['VOID_RANGER_HELM_LOR'], ItemData.runeliteKeyList()['VOID_MELEE_HELM_LOR']);
	itemMappings.ITEM_MYSTIC_BOOTS = new ItemMapping(ItemData.runeliteKeyList()['MYSTIC_BOOTS'], ItemData.runeliteKeyList()['MYSTIC_BOOTS_OR']);
	itemMappings.ITEM_MYSTIC_GLOVES = new ItemMapping(ItemData.runeliteKeyList()['MYSTIC_GLOVES'], ItemData.runeliteKeyList()['MYSTIC_GLOVES_OR']);
	itemMappings.ITEM_MYSTIC_HAT = new ItemMapping(ItemData.runeliteKeyList()['MYSTIC_HAT'], ItemData.runeliteKeyList()['MYSTIC_HAT_OR']);
	itemMappings.ITEM_MYSTIC_ROBE_BOTTOM = new ItemMapping(ItemData.runeliteKeyList()['MYSTIC_ROBE_BOTTOM'], ItemData.runeliteKeyList()['MYSTIC_ROBE_BOTTOM_OR']);
	itemMappings.ITEM_MYSTIC_ROBE_TOP = new ItemMapping(ItemData.runeliteKeyList()['MYSTIC_ROBE_TOP'], ItemData.runeliteKeyList()['MYSTIC_ROBE_TOP_OR']);
	itemMappings.ITEM_SHATTERED_RELICS_MYSTIC_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['SHATTERED_RELICS_MYSTIC_ORNAMENT_KIT'], ItemData.runeliteKeyList()['MYSTIC_BOOTS_OR'], ItemData.runeliteKeyList()['MYSTIC_GLOVES_OR'], ItemData.runeliteKeyList()['MYSTIC_HAT_OR'], ItemData.runeliteKeyList()['MYSTIC_ROBE_BOTTOM_OR'], ItemData.runeliteKeyList()['MYSTIC_ROBE_TOP_OR']);
	itemMappings.ITEM_CANNON_BARRELS = new ItemMapping(ItemData.runeliteKeyList()['CANNON_BARRELS'], ItemData.runeliteKeyList()['CANNON_BARRELS_OR']);
	itemMappings.ITEM_CANNON_BASE = new ItemMapping(ItemData.runeliteKeyList()['CANNON_BASE'], ItemData.runeliteKeyList()['CANNON_BASE_OR']);
	itemMappings.ITEM_CANNON_FURNACE = new ItemMapping(ItemData.runeliteKeyList()['CANNON_FURNACE'], ItemData.runeliteKeyList()['CANNON_FURNACE_OR']);
	itemMappings.ITEM_CANNON_STAND = new ItemMapping(ItemData.runeliteKeyList()['CANNON_STAND'], ItemData.runeliteKeyList()['CANNON_STAND_OR']);
	itemMappings.ITEM_SHATTERED_CANNON_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['SHATTERED_CANNON_ORNAMENT_KIT'], ItemData.runeliteKeyList()['CANNON_BARRELS_OR'], ItemData.runeliteKeyList()['CANNON_BASE_OR'], ItemData.runeliteKeyList()['CANNON_FURNACE_OR'], ItemData.runeliteKeyList()['CANNON_STAND_OR']);
	itemMappings.ITEM_ELDER_MAUL = new ItemMapping(ItemData.runeliteKeyList()['ELDER_MAUL'], ItemData.runeliteKeyList()['ELDER_MAUL_OR']);
	itemMappings.ITEM_HEAVY_BALLISTA = new ItemMapping(ItemData.runeliteKeyList()['HEAVY_BALLISTA'], ItemData.runeliteKeyList()['HEAVY_BALLISTA_OR']);
	itemMappings.ITEM_ELDER_CHAOS_HOOD = new ItemMapping(ItemData.runeliteKeyList()['ELDER_CHAOS_HOOD'], ItemData.runeliteKeyList()['ELDER_CHAOS_HOOD_OR']);
	itemMappings.ITEM_ELDER_CHAOS_TOP = new ItemMapping(ItemData.runeliteKeyList()['ELDER_CHAOS_TOP'], ItemData.runeliteKeyList()['ELDER_CHAOS_TOP_OR']);
	itemMappings.ITEM_ELDER_CHAOS_ROBE = new ItemMapping(ItemData.runeliteKeyList()['ELDER_CHAOS_ROBE'], ItemData.runeliteKeyList()['ELDER_CHAOS_ROBE_OR']);

	// Ensouled heads
	itemMappings.ITEM_ENSOULED_GOBLIN_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_GOBLIN_HEAD_13448'], ItemData.runeliteKeyList()['ENSOULED_GOBLIN_HEAD']);
	itemMappings.ITEM_ENSOULED_MONKEY_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_MONKEY_HEAD_13451'], ItemData.runeliteKeyList()['ENSOULED_MONKEY_HEAD']);
	itemMappings.ITEM_ENSOULED_IMP_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_IMP_HEAD_13454'], ItemData.runeliteKeyList()['ENSOULED_IMP_HEAD']);
	itemMappings.ITEM_ENSOULED_MINOTAUR_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_MINOTAUR_HEAD_13457'], ItemData.runeliteKeyList()['ENSOULED_MINOTAUR_HEAD']);
	itemMappings.ITEM_ENSOULED_SCORPION_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_SCORPION_HEAD_13460'], ItemData.runeliteKeyList()['ENSOULED_SCORPION_HEAD']);
	itemMappings.ITEM_ENSOULED_BEAR_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_BEAR_HEAD_13463'], ItemData.runeliteKeyList()['ENSOULED_BEAR_HEAD']);
	itemMappings.ITEM_ENSOULED_UNICORN_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_UNICORN_HEAD_13466'], ItemData.runeliteKeyList()['ENSOULED_UNICORN_HEAD']);
	itemMappings.ITEM_ENSOULED_DOG_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_DOG_HEAD_13469'], ItemData.runeliteKeyList()['ENSOULED_DOG_HEAD']);
	itemMappings.ITEM_ENSOULED_CHAOS_DRUID_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_CHAOS_DRUID_HEAD_13472'], ItemData.runeliteKeyList()['ENSOULED_CHAOS_DRUID_HEAD']);
	itemMappings.ITEM_ENSOULED_GIANT_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_GIANT_HEAD_13475'], ItemData.runeliteKeyList()['ENSOULED_GIANT_HEAD']);
	itemMappings.ITEM_ENSOULED_OGRE_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_OGRE_HEAD_13478'], ItemData.runeliteKeyList()['ENSOULED_OGRE_HEAD']);
	itemMappings.ITEM_ENSOULED_ELF_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_ELF_HEAD_13481'], ItemData.runeliteKeyList()['ENSOULED_ELF_HEAD']);
	itemMappings.ITEM_ENSOULED_TROLL_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_TROLL_HEAD_13484'], ItemData.runeliteKeyList()['ENSOULED_TROLL_HEAD']);
	itemMappings.ITEM_ENSOULED_HORROR_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_HORROR_HEAD_13487'], ItemData.runeliteKeyList()['ENSOULED_HORROR_HEAD']);
	itemMappings.ITEM_ENSOULED_KALPHITE_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_KALPHITE_HEAD_13490'], ItemData.runeliteKeyList()['ENSOULED_KALPHITE_HEAD']);
	itemMappings.ITEM_ENSOULED_DAGANNOTH_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_DAGANNOTH_HEAD_13493'], ItemData.runeliteKeyList()['ENSOULED_DAGANNOTH_HEAD']);
	itemMappings.ITEM_ENSOULED_BLOODVELD_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_BLOODVELD_HEAD_13496'], ItemData.runeliteKeyList()['ENSOULED_BLOODVELD_HEAD']);
	itemMappings.ITEM_ENSOULED_TZHAAR_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_TZHAAR_HEAD_13499'], ItemData.runeliteKeyList()['ENSOULED_TZHAAR_HEAD']);
	itemMappings.ITEM_ENSOULED_DEMON_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_DEMON_HEAD_13502'], ItemData.runeliteKeyList()['ENSOULED_DEMON_HEAD']);
	itemMappings.ITEM_ENSOULED_HELLHOUND_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_HELLHOUND_HEAD_26997'], ItemData.runeliteKeyList()['ENSOULED_HELLHOUND_HEAD']);
	itemMappings.ITEM_ENSOULED_AVIANSIE_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_AVIANSIE_HEAD_13505'], ItemData.runeliteKeyList()['ENSOULED_AVIANSIE_HEAD']);
	itemMappings.ITEM_ENSOULED_ABYSSAL_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_ABYSSAL_HEAD_13508'], ItemData.runeliteKeyList()['ENSOULED_ABYSSAL_HEAD']);
	itemMappings.ITEM_ENSOULED_DRAGON_HEAD = new ItemMapping(ItemData.runeliteKeyList()['ENSOULED_DRAGON_HEAD_13511'], ItemData.runeliteKeyList()['ENSOULED_DRAGON_HEAD']);

	// Imbued rings
	itemMappings.ITEM_BERSERKER_RING = new ItemMapping(ItemData.runeliteKeyList()['BERSERKER_RING'], true, 1, ItemData.runeliteKeyList()['BERSERKER_RING_I']);
	itemMappings.ITEM_SEERS_RING = new ItemMapping(ItemData.runeliteKeyList()['SEERS_RING'], true, 1, ItemData.runeliteKeyList()['SEERS_RING_I']);
	itemMappings.ITEM_WARRIOR_RING = new ItemMapping(ItemData.runeliteKeyList()['WARRIOR_RING'], true, 1, ItemData.runeliteKeyList()['WARRIOR_RING_I']);
	itemMappings.ITEM_ARCHERS_RING = new ItemMapping(ItemData.runeliteKeyList()['ARCHERS_RING'], true, 1, ItemData.runeliteKeyList()['ARCHERS_RING_I']);
	itemMappings.ITEM_TREASONOUS_RING = new ItemMapping(ItemData.runeliteKeyList()['TREASONOUS_RING'], true, 1, ItemData.runeliteKeyList()['TREASONOUS_RING_I']);
	itemMappings.ITEM_TYRANNICAL_RING = new ItemMapping(ItemData.runeliteKeyList()['TYRANNICAL_RING'], true, 1, ItemData.runeliteKeyList()['TYRANNICAL_RING_I']);
	itemMappings.ITEM_RING_OF_THE_GODS = new ItemMapping(ItemData.runeliteKeyList()['RING_OF_THE_GODS'], true, 1, ItemData.runeliteKeyList()['RING_OF_THE_GODS_I']);
	itemMappings.ITEM_RING_OF_SUFFERING = new ItemMapping(ItemData.runeliteKeyList()['RING_OF_SUFFERING'], true, 1, ItemData.runeliteKeyList()['RING_OF_SUFFERING_I']);
	itemMappings.ITEM_GRANITE_RING = new ItemMapping(ItemData.runeliteKeyList()['GRANITE_RING'], true, 1, ItemData.runeliteKeyList()['GRANITE_RING_I']);

	// Bounty hunter
	itemMappings.ITEM_GRANITE_MAUL = new ItemMapping(ItemData.runeliteKeyList()['GRANITE_MAUL'], ItemData.runeliteKeyList()['GRANITE_MAUL_12848']);
	itemMappings.ITEM_MAGIC_SHORTBOW = new ItemMapping(ItemData.runeliteKeyList()['MAGIC_SHORTBOW'], ItemData.runeliteKeyList()['MAGIC_SHORTBOW_I']);
	itemMappings.ITEM_MAGIC_SHORTBOW_SCROLL = new ItemMapping(ItemData.runeliteKeyList()['MAGIC_SHORTBOW_SCROLL'], ItemData.runeliteKeyList()['MAGIC_SHORTBOW_I']);
	itemMappings.ITEM_SARADOMINS_BLESSED_SWORD = new ItemMapping(ItemData.runeliteKeyList()['SARADOMINS_TEAR'], ItemData.runeliteKeyList()['SARADOMINS_BLESSED_SWORD']);
	itemMappings.ITEM_ABYSSAL_DAGGER = new ItemMapping(ItemData.runeliteKeyList()['ABYSSAL_DAGGER'], ItemData.runeliteKeyList()['ABYSSAL_DAGGER_BH']);
	itemMappings.ITEM_DRAGON_LONGSWORD = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_LONGSWORD'], ItemData.runeliteKeyList()['DRAGON_LONGSWORD_BH'], ItemData.runeliteKeyList()['DRAGON_LONGSWORD_CR']);
	itemMappings.ITEM_DRAGON_MACE = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_MACE'], ItemData.runeliteKeyList()['DRAGON_MACE_BH'], ItemData.runeliteKeyList()['DRAGON_MACE_CR']);

	// Jewellery with charges
	itemMappings.ITEM_RING_OF_WEALTH = new ItemMapping(ItemData.runeliteKeyList()['RING_OF_WEALTH'], true, 1, ItemData.runeliteKeyList()['RING_OF_WEALTH_1']);
	itemMappings.ITEM_RING_OF_WEALTH_SCROLL = new ItemMapping(ItemData.runeliteKeyList()['RING_OF_WEALTH_SCROLL'], ItemData.runeliteKeyList()['RING_OF_WEALTH_I'], ItemData.runeliteKeyList()['RING_OF_WEALTH_I1'], ItemData.runeliteKeyList()['RING_OF_WEALTH_I2'], ItemData.runeliteKeyList()['RING_OF_WEALTH_I3'], ItemData.runeliteKeyList()['RING_OF_WEALTH_I4'], ItemData.runeliteKeyList()['RING_OF_WEALTH_I5']);
	itemMappings.ITEM_AMULET_OF_GLORY = new ItemMapping(ItemData.runeliteKeyList()['AMULET_OF_GLORY'], ItemData.runeliteKeyList()['AMULET_OF_GLORY1'], ItemData.runeliteKeyList()['AMULET_OF_GLORY2'], ItemData.runeliteKeyList()['AMULET_OF_GLORY3'], ItemData.runeliteKeyList()['AMULET_OF_GLORY5']);
	itemMappings.ITEM_AMULET_OF_GLORY_T = new ItemMapping(ItemData.runeliteKeyList()['AMULET_OF_GLORY_T'], ItemData.runeliteKeyList()['AMULET_OF_GLORY_T1'], ItemData.runeliteKeyList()['AMULET_OF_GLORY_T2'], ItemData.runeliteKeyList()['AMULET_OF_GLORY_T3'], ItemData.runeliteKeyList()['AMULET_OF_GLORY_T5']);
	itemMappings.ITEM_SKILLS_NECKLACE = new ItemMapping(ItemData.runeliteKeyList()['SKILLS_NECKLACE'], ItemData.runeliteKeyList()['SKILLS_NECKLACE1'], ItemData.runeliteKeyList()['SKILLS_NECKLACE2'], ItemData.runeliteKeyList()['SKILLS_NECKLACE3'], ItemData.runeliteKeyList()['SKILLS_NECKLACE5']);
	itemMappings.ITEM_RING_OF_DUELING = new ItemMapping(ItemData.runeliteKeyList()['RING_OF_DUELING8'], ItemData.runeliteKeyList()['RING_OF_DUELING1'], ItemData.runeliteKeyList()['RING_OF_DUELING2'], ItemData.runeliteKeyList()['RING_OF_DUELING3'], ItemData.runeliteKeyList()['RING_OF_DUELING4'], ItemData.runeliteKeyList()['RING_OF_DUELING5'], ItemData.runeliteKeyList()['RING_OF_DUELING6'], ItemData.runeliteKeyList()['RING_OF_DUELING7']);
	itemMappings.ITEM_GAMES_NECKLACE = new ItemMapping(ItemData.runeliteKeyList()['GAMES_NECKLACE8'], ItemData.runeliteKeyList()['GAMES_NECKLACE1'], ItemData.runeliteKeyList()['GAMES_NECKLACE2'], ItemData.runeliteKeyList()['GAMES_NECKLACE3'], ItemData.runeliteKeyList()['GAMES_NECKLACE4'], ItemData.runeliteKeyList()['GAMES_NECKLACE5'], ItemData.runeliteKeyList()['GAMES_NECKLACE6'], ItemData.runeliteKeyList()['GAMES_NECKLACE7']);

	// Degradable/charged weaponry/armour
	itemMappings.ITEM_ABYSSAL_WHIP = new ItemMapping(ItemData.runeliteKeyList()['ABYSSAL_WHIP'], ItemData.runeliteKeyList()['VOLCANIC_ABYSSAL_WHIP'], ItemData.runeliteKeyList()['FROZEN_ABYSSAL_WHIP'], ItemData.runeliteKeyList()['ABYSSAL_WHIP_OR']);
	itemMappings.ITEM_KRAKEN_TENTACLE = new ItemMapping(ItemData.runeliteKeyList()['KRAKEN_TENTACLE'], ItemData.runeliteKeyList()['ABYSSAL_TENTACLE'], ItemData.runeliteKeyList()['ABYSSAL_TENTACLE_OR']);
	itemMappings.ITEM_TRIDENT_OF_THE_SEAS = new ItemMapping(ItemData.runeliteKeyList()['UNCHARGED_TRIDENT'], ItemData.runeliteKeyList()['TRIDENT_OF_THE_SEAS']);
	itemMappings.ITEM_TRIDENT_OF_THE_SEAS_E = new ItemMapping(ItemData.runeliteKeyList()['UNCHARGED_TRIDENT_E'], ItemData.runeliteKeyList()['TRIDENT_OF_THE_SEAS_E']);
	itemMappings.ITEM_TRIDENT_OF_THE_SWAMP = new ItemMapping(ItemData.runeliteKeyList()['UNCHARGED_TOXIC_TRIDENT'], ItemData.runeliteKeyList()['TRIDENT_OF_THE_SWAMP']);
	itemMappings.ITEM_TRIDENT_OF_THE_SWAMP_E = new ItemMapping(ItemData.runeliteKeyList()['UNCHARGED_TOXIC_TRIDENT_E'], ItemData.runeliteKeyList()['TRIDENT_OF_THE_SWAMP_E']);
	itemMappings.ITEM_TOXIC_BLOWPIPE = new ItemMapping(ItemData.runeliteKeyList()['TOXIC_BLOWPIPE_EMPTY'], ItemData.runeliteKeyList()['TOXIC_BLOWPIPE']);
	itemMappings.ITEM_TOXIC_STAFF_OFF_THE_DEAD = new ItemMapping(ItemData.runeliteKeyList()['TOXIC_STAFF_UNCHARGED'], ItemData.runeliteKeyList()['TOXIC_STAFF_OF_THE_DEAD']);
	itemMappings.ITEM_SERPENTINE_HELM = new ItemMapping(ItemData.runeliteKeyList()['SERPENTINE_HELM_UNCHARGED'], ItemData.runeliteKeyList()['SERPENTINE_HELM'], ItemData.runeliteKeyList()['TANZANITE_HELM_UNCHARGED'], ItemData.runeliteKeyList()['TANZANITE_HELM'], ItemData.runeliteKeyList()['MAGMA_HELM_UNCHARGED'], ItemData.runeliteKeyList()['MAGMA_HELM']);
	itemMappings.ITEM_DRAGONFIRE_SHIELD = new ItemMapping(ItemData.runeliteKeyList()['DRAGONFIRE_SHIELD_11284'], ItemData.runeliteKeyList()['DRAGONFIRE_SHIELD']);
	itemMappings.ITEM_DRAGONFIRE_WARD = new ItemMapping(ItemData.runeliteKeyList()['DRAGONFIRE_WARD_22003'], ItemData.runeliteKeyList()['DRAGONFIRE_WARD']);
	itemMappings.ITEM_ANCIENT_WYVERN_SHIELD = new ItemMapping(ItemData.runeliteKeyList()['ANCIENT_WYVERN_SHIELD_21634'], ItemData.runeliteKeyList()['ANCIENT_WYVERN_SHIELD']);
	itemMappings.ITEM_SANGUINESTI_STAFF = new ItemMapping(ItemData.runeliteKeyList()['SANGUINESTI_STAFF_UNCHARGED'], ItemData.runeliteKeyList()['SANGUINESTI_STAFF'], ItemData.runeliteKeyList()['HOLY_SANGUINESTI_STAFF_UNCHARGED'], ItemData.runeliteKeyList()['HOLY_SANGUINESTI_STAFF']);
	itemMappings.ITEM_SCYTHE_OF_VITUR = new ItemMapping(ItemData.runeliteKeyList()['SCYTHE_OF_VITUR_UNCHARGED'], ItemData.runeliteKeyList()['SCYTHE_OF_VITUR'], ItemData.runeliteKeyList()['HOLY_SCYTHE_OF_VITUR_UNCHARGED'], ItemData.runeliteKeyList()['HOLY_SCYTHE_OF_VITUR'], ItemData.runeliteKeyList()['SANGUINE_SCYTHE_OF_VITUR_UNCHARGED'], ItemData.runeliteKeyList()['SANGUINE_SCYTHE_OF_VITUR']);
	itemMappings.ITEM_TOME_OF_FIRE = new ItemMapping(ItemData.runeliteKeyList()['TOME_OF_FIRE_EMPTY'], ItemData.runeliteKeyList()['TOME_OF_FIRE']);
	itemMappings.ITEM_TOME_OF_WATER = new ItemMapping(ItemData.runeliteKeyList()['TOME_OF_WATER_EMPTY'], ItemData.runeliteKeyList()['TOME_OF_WATER']);
	itemMappings.ITEM_CRAWS_BOW = new ItemMapping(ItemData.runeliteKeyList()['CRAWS_BOW_U'], ItemData.runeliteKeyList()['CRAWS_BOW']);
	itemMappings.ITEM_VIGGORAS_CHAINMACE = new ItemMapping(ItemData.runeliteKeyList()['VIGGORAS_CHAINMACE_U'], ItemData.runeliteKeyList()['VIGGORAS_CHAINMACE']);
	itemMappings.ITEM_THAMMARONS_SCEPTRE = new ItemMapping(ItemData.runeliteKeyList()['THAMMARONS_SCEPTRE_U'], ItemData.runeliteKeyList()['THAMMARONS_SCEPTRE']);
	itemMappings.ITEM_WEBWEAVER_BOW = new ItemMapping(ItemData.runeliteKeyList()['WEBWEAVER_BOW_U'], ItemData.runeliteKeyList()['WEBWEAVER_BOW']);
	itemMappings.ITEM_URSINE_CHAINMACE = new ItemMapping(ItemData.runeliteKeyList()['URSINE_CHAINMACE_U'], ItemData.runeliteKeyList()['URSINE_CHAINMACE']);
	itemMappings.ITEM_ACCURSED_SCEPTRE = new ItemMapping(ItemData.runeliteKeyList()['ACCURSED_SCEPTRE_U'], ItemData.runeliteKeyList()['ACCURSED_SCEPTRE']);
	itemMappings.ITEM_ACCURSED_SCEPTRE_A = new ItemMapping(ItemData.runeliteKeyList()['ACCURSED_SCEPTRE_AU'], ItemData.runeliteKeyList()['ACCURSED_SCEPTRE_A']);
	itemMappings.ITEM_BRYOPHYTAS_STAFF = new ItemMapping(ItemData.runeliteKeyList()['BRYOPHYTAS_STAFF_UNCHARGED'], ItemData.runeliteKeyList()['BRYOPHYTAS_STAFF']);
	itemMappings.ITEM_RING_OF_ENDURANCE = new ItemMapping(ItemData.runeliteKeyList()['RING_OF_ENDURANCE_UNCHARGED_24844'], ItemData.runeliteKeyList()['RING_OF_ENDURANCE']);
	itemMappings.ITEM_TUMEKENS_SHADOW = new ItemMapping(ItemData.runeliteKeyList()['TUMEKENS_SHADOW_UNCHARGED'], ItemData.runeliteKeyList()['TUMEKENS_SHADOW']);
	itemMappings.ITEM_PHARAOHS_SCEPTRE = new ItemMapping(ItemData.runeliteKeyList()['PHARAOHS_SCEPTRE_UNCHARGED'], true, 1, ItemData.runeliteKeyList()['PHARAOHS_SCEPTRE']);
	itemMappings.ITEM_VENATOR_BOW = new ItemMapping(ItemData.runeliteKeyList()['VENATOR_BOW_UNCHARGED'], ItemData.runeliteKeyList()['VENATOR_BOW']);

	// Tombs of Amascut gear
	itemMappings.ITEM_ELIDINIS_WARD = new ItemMapping(ItemData.runeliteKeyList()['ELIDINIS_WARD'], ItemData.runeliteKeyList()['ELIDINIS_WARD_F'], ItemData.runeliteKeyList()['ELIDINIS_WARD_OR']);
	itemMappings.ITEM_OSMUMTENS_FANG = new ItemMapping(ItemData.runeliteKeyList()['OSMUMTENS_FANG'], ItemData.runeliteKeyList()['OSMUMTENS_FANG_OR']);

	// Infinity colour kits
	itemMappings.ITEM_INFINITY_TOP = new ItemMapping(ItemData.runeliteKeyList()['INFINITY_TOP'], ItemData.runeliteKeyList()['INFINITY_TOP_20574'], ItemData.runeliteKeyList()['DARK_INFINITY_TOP'], ItemData.runeliteKeyList()['LIGHT_INFINITY_TOP']);
	itemMappings.ITEM_INFINITY_TOP_LIGHT_COLOUR_KIT = new ItemMapping(ItemData.runeliteKeyList()['LIGHT_INFINITY_COLOUR_KIT'], ItemData.runeliteKeyList()['LIGHT_INFINITY_TOP']);
	itemMappings.ITEM_INFINITY_TOP_DARK_COLOUR_KIT = new ItemMapping(ItemData.runeliteKeyList()['DARK_INFINITY_COLOUR_KIT'], ItemData.runeliteKeyList()['DARK_INFINITY_TOP']);
	itemMappings.ITEM_INFINITY_BOTTOMS = new ItemMapping(ItemData.runeliteKeyList()['INFINITY_BOTTOMS'], ItemData.runeliteKeyList()['INFINITY_BOTTOMS_20575'], ItemData.runeliteKeyList()['DARK_INFINITY_BOTTOMS'], ItemData.runeliteKeyList()['LIGHT_INFINITY_BOTTOMS']);
	itemMappings.ITEM_INFINITY_BOTTOMS_LIGHT_COLOUR_KIT = new ItemMapping(ItemData.runeliteKeyList()['LIGHT_INFINITY_COLOUR_KIT'], ItemData.runeliteKeyList()['LIGHT_INFINITY_BOTTOMS']);
	itemMappings.ITEM_INFINITY_BOTTOMS_DARK_COLOUR_KIT = new ItemMapping(ItemData.runeliteKeyList()['DARK_INFINITY_COLOUR_KIT'], ItemData.runeliteKeyList()['DARK_INFINITY_BOTTOMS']);
	itemMappings.ITEM_INFINITY_HAT = new ItemMapping(ItemData.runeliteKeyList()['INFINITY_HAT'], ItemData.runeliteKeyList()['DARK_INFINITY_HAT'], ItemData.runeliteKeyList()['LIGHT_INFINITY_HAT']);
	itemMappings.ITEM_INFINITY_HAT_LIGHT_COLOUR_KIT = new ItemMapping(ItemData.runeliteKeyList()['LIGHT_INFINITY_COLOUR_KIT'], ItemData.runeliteKeyList()['LIGHT_INFINITY_HAT']);
	itemMappings.ITEM_INFINITY_HAT_DARK_COLOUR_KIT = new ItemMapping(ItemData.runeliteKeyList()['DARK_INFINITY_COLOUR_KIT'], ItemData.runeliteKeyList()['DARK_INFINITY_HAT']);

	// Miscellaneous ornament kits
	itemMappings.ITEM_DARK_BOW = new ItemMapping(ItemData.runeliteKeyList()['DARK_BOW'], ItemData.runeliteKeyList()['DARK_BOW_12765'], ItemData.runeliteKeyList()['DARK_BOW_12766'], ItemData.runeliteKeyList()['DARK_BOW_12767'], ItemData.runeliteKeyList()['DARK_BOW_12768'], ItemData.runeliteKeyList()['DARK_BOW_20408'], ItemData.runeliteKeyList()['DARK_BOW_BH']);
	itemMappings.ITEM_ODIUM_WARD = new ItemMapping(ItemData.runeliteKeyList()['ODIUM_WARD'], ItemData.runeliteKeyList()['ODIUM_WARD_12807']);
	itemMappings.ITEM_MALEDICTION_WARD = new ItemMapping(ItemData.runeliteKeyList()['MALEDICTION_WARD'], ItemData.runeliteKeyList()['MALEDICTION_WARD_12806']);
	itemMappings.ITEM_STEAM_BATTLESTAFF = new ItemMapping(ItemData.runeliteKeyList()['STEAM_BATTLESTAFF'], ItemData.runeliteKeyList()['STEAM_BATTLESTAFF_12795']);
	itemMappings.ITEM_LAVA_BATTLESTAFF = new ItemMapping(ItemData.runeliteKeyList()['LAVA_BATTLESTAFF'], ItemData.runeliteKeyList()['LAVA_BATTLESTAFF_21198']);
	itemMappings.ITEM_TZHAARKETOM = new ItemMapping(ItemData.runeliteKeyList()['TZHAARKETOM'], ItemData.runeliteKeyList()['TZHAARKETOM_T']);
	itemMappings.ITEM_TZHAARKETOM_ORNAMENT_KIT = new ItemMapping(ItemData.runeliteKeyList()['TZHAARKETOM_ORNAMENT_KIT'], ItemData.runeliteKeyList()['TZHAARKETOM_T']);
	itemMappings.ITEM_DRAGON_HUNTER_CROSSBOW = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_HUNTER_CROSSBOW'], ItemData.runeliteKeyList()['DRAGON_HUNTER_CROSSBOW_B'], ItemData.runeliteKeyList()['DRAGON_HUNTER_CROSSBOW_T']);

	// Slayer helm/black mask
	itemMappings.ITEM_BLACK_MASK = new ItemMapping(ItemData.runeliteKeyList()['BLACK_MASK'], true, 1, ItemData.runeliteKeyList()['BLACK_MASK'], ItemData.runeliteKeyList()['SLAYER_HELMET']);

	// Revertible items
	itemMappings.ITEM_HYDRA_LEATHER = new ItemMapping(ItemData.runeliteKeyList()['HYDRA_LEATHER'], ItemData.runeliteKeyList()['FEROCIOUS_GLOVES']);
	itemMappings.ITEM_HYDRA_TAIL = new ItemMapping(ItemData.runeliteKeyList()['HYDRA_TAIL'], ItemData.runeliteKeyList()['BONECRUSHER_NECKLACE']);
	itemMappings.ITEM_DRAGONBONE_NECKLACE = new ItemMapping(ItemData.runeliteKeyList()['DRAGONBONE_NECKLACE'], ItemData.runeliteKeyList()['BONECRUSHER_NECKLACE']);
	itemMappings.ITEM_BOTTOMLESS_COMPOST_BUCKET = new ItemMapping(ItemData.runeliteKeyList()['BOTTOMLESS_COMPOST_BUCKET'], ItemData.runeliteKeyList()['BOTTOMLESS_COMPOST_BUCKET_22997']);
	itemMappings.ITEM_BASILISK_JAW = new ItemMapping(ItemData.runeliteKeyList()['BASILISK_JAW'], ItemData.runeliteKeyList()['NEITIZNOT_FACEGUARD']);
	itemMappings.ITEM_HELM_OF_NEITIZNOT = new ItemMapping(ItemData.runeliteKeyList()['HELM_OF_NEITIZNOT'], ItemData.runeliteKeyList()['NEITIZNOT_FACEGUARD'], ItemData.runeliteKeyList()['HELM_OF_NEITIZNOT_OR']);
	itemMappings.ITEM_TWISTED_HORNS = new ItemMapping(ItemData.runeliteKeyList()['TWISTED_HORNS'], ItemData.runeliteKeyList()['TWISTED_SLAYER_HELMET'], ItemData.runeliteKeyList()['TWISTED_SLAYER_HELMET_I'], ItemData.runeliteKeyList()['TWISTED_SLAYER_HELMET_I_25191'], ItemData.runeliteKeyList()['TWISTED_SLAYER_HELMET_I_26681']);
	itemMappings.ITEM_ELDRITCH_ORB = new ItemMapping(ItemData.runeliteKeyList()['ELDRITCH_ORB'], ItemData.runeliteKeyList()['ELDRITCH_NIGHTMARE_STAFF']);
	itemMappings.ITEM_HARMONISED_ORB = new ItemMapping(ItemData.runeliteKeyList()['HARMONISED_ORB'], ItemData.runeliteKeyList()['HARMONISED_NIGHTMARE_STAFF']);
	itemMappings.ITEM_VOLATILE_ORB = new ItemMapping(ItemData.runeliteKeyList()['VOLATILE_ORB'], ItemData.runeliteKeyList()['VOLATILE_NIGHTMARE_STAFF']);
	itemMappings.ITEM_NIGHTMARE_STAFF = new ItemMapping(ItemData.runeliteKeyList()['NIGHTMARE_STAFF'], ItemData.runeliteKeyList()['ELDRITCH_NIGHTMARE_STAFF'], ItemData.runeliteKeyList()['HARMONISED_NIGHTMARE_STAFF'], ItemData.runeliteKeyList()['VOLATILE_NIGHTMARE_STAFF']);
	itemMappings.ITEM_GHARZI_RAPIER = new ItemMapping(ItemData.runeliteKeyList()['GHRAZI_RAPIER'], ItemData.runeliteKeyList()['HOLY_GHRAZI_RAPIER']);
	itemMappings.ITEM_MASTER_SCROLL_BOOK = new ItemMapping(ItemData.runeliteKeyList()['MASTER_SCROLL_BOOK_EMPTY'], ItemData.runeliteKeyList()['MASTER_SCROLL_BOOK']);
	itemMappings.ITEM_ARCANE_SIGIL = new ItemMapping(ItemData.runeliteKeyList()['ARCANE_SIGIL'], ItemData.runeliteKeyList()['ELIDINIS_WARD_F'], ItemData.runeliteKeyList()['ELIDINIS_WARD_OR']);

	// Trouver Parchment
	itemMappings.ITEM_TROUVER_PARCHMENT = new ItemMapping(ItemData.runeliteKeyList()['TROUVER_PARCHMENT'], ItemData.runeliteKeyList()['INFERNAL_MAX_CAPE_L'], ItemData.runeliteKeyList()['FIRE_MAX_CAPE_L'], ItemData.runeliteKeyList()['ASSEMBLER_MAX_CAPE_L'], ItemData.runeliteKeyList()['BRONZE_DEFENDER_L'], ItemData.runeliteKeyList()['IRON_DEFENDER_L'], ItemData.runeliteKeyList()['STEEL_DEFENDER_L'], ItemData.runeliteKeyList()['BLACK_DEFENDER_L'], ItemData.runeliteKeyList()['MITHRIL_DEFENDER_L'], ItemData.runeliteKeyList()['ADAMANT_DEFENDER_L'],
		ItemData.runeliteKeyList()['RUNE_DEFENDER_L'], ItemData.runeliteKeyList()['DRAGON_DEFENDER_L'], ItemData.runeliteKeyList()['DECORATIVE_SWORD_L'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24159'], ItemData.runeliteKeyList()['DECORATIVE_HELM_L'], ItemData.runeliteKeyList()['DECORATIVE_SHIELD_L'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24162'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24163'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24164'],
		ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24165'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24166'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24167'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24168'], ItemData.runeliteKeyList()['SARADOMIN_HALO_L'], ItemData.runeliteKeyList()['ZAMORAK_HALO_L'], ItemData.runeliteKeyList()['GUTHIX_HALO_L'], ItemData.runeliteKeyList()['HEALER_HAT_L'], ItemData.runeliteKeyList()['FIGHTER_HAT_L'], ItemData.runeliteKeyList()['RANGER_HAT_L'],
		ItemData.runeliteKeyList()['FIGHTER_TORSO_L'], ItemData.runeliteKeyList()['PENANCE_SKIRT_L'], ItemData.runeliteKeyList()['VOID_KNIGHT_TOP_L'], ItemData.runeliteKeyList()['ELITE_VOID_TOP_L'], ItemData.runeliteKeyList()['VOID_KNIGHT_ROBE_L'], ItemData.runeliteKeyList()['ELITE_VOID_ROBE_L'], ItemData.runeliteKeyList()['VOID_KNIGHT_MACE_L'], ItemData.runeliteKeyList()['VOID_KNIGHT_GLOVES_L'], ItemData.runeliteKeyList()['VOID_MAGE_HELM_L'], ItemData.runeliteKeyList()['VOID_RANGER_HELM_L'],
		ItemData.runeliteKeyList()['VOID_MELEE_HELM_L'], ItemData.runeliteKeyList()['AVERNIC_DEFENDER_L'], ItemData.runeliteKeyList()['ARMADYL_HALO_L'], ItemData.runeliteKeyList()['BANDOS_HALO_L'], ItemData.runeliteKeyList()['SEREN_HALO_L'], ItemData.runeliteKeyList()['ANCIENT_HALO_L'], ItemData.runeliteKeyList()['BRASSICA_HALO_L'], ItemData.runeliteKeyList()['AVAS_ASSEMBLER_L'], ItemData.runeliteKeyList()['FIRE_CAPE_L'], ItemData.runeliteKeyList()['INFERNAL_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_SARADOMIN_MAX_CAPE_L'],
		ItemData.runeliteKeyList()['IMBUED_ZAMORAK_MAX_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_GUTHIX_MAX_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_SARADOMIN_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_ZAMORAK_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_GUTHIX_CAPE_L'], ItemData.runeliteKeyList()['RUNE_POUCH_L'], ItemData.runeliteKeyList()['RUNNER_HAT_L'], ItemData.runeliteKeyList()['DECORATIVE_BOOTS_L'], ItemData.runeliteKeyList()['DECORATIVE_FULL_HELM_L'],
		ItemData.runeliteKeyList()['MASORI_ASSEMBLER_L'], ItemData.runeliteKeyList()['MASORI_ASSEMBLER_MAX_CAPE_L'], ItemData.runeliteKeyList()['RUNE_DEFENDER_LT'], ItemData.runeliteKeyList()['VOID_KNIGHT_TOP_LOR'], ItemData.runeliteKeyList()['VOID_KNIGHT_ROBE_LOR'], ItemData.runeliteKeyList()['VOID_KNIGHT_GLOVES_LOR'], ItemData.runeliteKeyList()['ELITE_VOID_TOP_LOR'], ItemData.runeliteKeyList()['ELITE_VOID_ROBE_LOR'], ItemData.runeliteKeyList()['VOID_MAGE_HELM_LOR'],
		ItemData.runeliteKeyList()['VOID_RANGER_HELM_LOR'], ItemData.runeliteKeyList()['VOID_MELEE_HELM_LOR'], ItemData.runeliteKeyList()['BARRONITE_MACE_L']);

	itemMappings.ITEM_TROUVER_PARCHMENT_REFUND_LARGE = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], 475000, ItemData.runeliteKeyList()['INFERNAL_MAX_CAPE_L'], ItemData.runeliteKeyList()['FIRE_MAX_CAPE_L'], ItemData.runeliteKeyList()['ASSEMBLER_MAX_CAPE_L'], ItemData.runeliteKeyList()['RUNE_DEFENDER_L'], ItemData.runeliteKeyList()['DRAGON_DEFENDER_L'], ItemData.runeliteKeyList()['DECORATIVE_SWORD_L'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24159'], ItemData.runeliteKeyList()['DECORATIVE_HELM_L'], ItemData.runeliteKeyList()['DECORATIVE_SHIELD_L'],
		ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24162'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24163'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24164'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24165'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24166'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24167'], ItemData.runeliteKeyList()['DECORATIVE_ARMOUR_L_24168'], ItemData.runeliteKeyList()['SARADOMIN_HALO_L'],
		ItemData.runeliteKeyList()['ZAMORAK_HALO_L'], ItemData.runeliteKeyList()['GUTHIX_HALO_L'], ItemData.runeliteKeyList()['HEALER_HAT_L'], ItemData.runeliteKeyList()['FIGHTER_HAT_L'], ItemData.runeliteKeyList()['RANGER_HAT_L'], ItemData.runeliteKeyList()['FIGHTER_TORSO_L'], ItemData.runeliteKeyList()['PENANCE_SKIRT_L'], ItemData.runeliteKeyList()['VOID_KNIGHT_TOP_L'], ItemData.runeliteKeyList()['ELITE_VOID_TOP_L'], ItemData.runeliteKeyList()['VOID_KNIGHT_ROBE_L'], ItemData.runeliteKeyList()['ELITE_VOID_ROBE_L'], ItemData.runeliteKeyList()['VOID_KNIGHT_MACE_L'],
		ItemData.runeliteKeyList()['VOID_KNIGHT_GLOVES_L'], ItemData.runeliteKeyList()['VOID_MAGE_HELM_L'], ItemData.runeliteKeyList()['VOID_RANGER_HELM_L'], ItemData.runeliteKeyList()['VOID_MELEE_HELM_L'], ItemData.runeliteKeyList()['AVERNIC_DEFENDER_L'], ItemData.runeliteKeyList()['ARMADYL_HALO_L'], ItemData.runeliteKeyList()['BANDOS_HALO_L'], ItemData.runeliteKeyList()['SEREN_HALO_L'], ItemData.runeliteKeyList()['ANCIENT_HALO_L'], ItemData.runeliteKeyList()['BRASSICA_HALO_L'], ItemData.runeliteKeyList()['AVAS_ASSEMBLER_L'],
		ItemData.runeliteKeyList()['FIRE_CAPE_L'], ItemData.runeliteKeyList()['INFERNAL_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_SARADOMIN_MAX_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_ZAMORAK_MAX_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_GUTHIX_MAX_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_SARADOMIN_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_ZAMORAK_CAPE_L'], ItemData.runeliteKeyList()['IMBUED_GUTHIX_CAPE_L'], ItemData.runeliteKeyList()['RUNE_POUCH_L'], ItemData.runeliteKeyList()['RUNNER_HAT_L'], ItemData.runeliteKeyList()['DECORATIVE_BOOTS_L'], ItemData.runeliteKeyList()['DECORATIVE_FULL_HELM_L'],
		ItemData.runeliteKeyList()['MASORI_ASSEMBLER_L'], ItemData.runeliteKeyList()['MASORI_ASSEMBLER_MAX_CAPE_L'], ItemData.runeliteKeyList()['RUNE_DEFENDER_LT'], ItemData.runeliteKeyList()['VOID_KNIGHT_TOP_LOR'], ItemData.runeliteKeyList()['VOID_KNIGHT_ROBE_LOR'], ItemData.runeliteKeyList()['VOID_KNIGHT_GLOVES_LOR'], ItemData.runeliteKeyList()['ELITE_VOID_TOP_LOR'], ItemData.runeliteKeyList()['ELITE_VOID_ROBE_LOR'], ItemData.runeliteKeyList()['VOID_MAGE_HELM_LOR'],
		ItemData.runeliteKeyList()['VOID_RANGER_HELM_LOR'], ItemData.runeliteKeyList()['VOID_MELEE_HELM_LOR'], ItemData.runeliteKeyList()['BARRONITE_MACE_L']);
	itemMappings.ITEM_TROUVER_PARCHMENT_REFUND_SMALL = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], 47500, ItemData.runeliteKeyList()['BRONZE_DEFENDER_L'], ItemData.runeliteKeyList()['IRON_DEFENDER_L'], ItemData.runeliteKeyList()['STEEL_DEFENDER_L'], ItemData.runeliteKeyList()['BLACK_DEFENDER_L'], ItemData.runeliteKeyList()['MITHRIL_DEFENDER_L'], ItemData.runeliteKeyList()['ADAMANT_DEFENDER_L']);

	// Crystal items
	itemMappings.ITEM_CRYSTAL_TOOL_SEED = new ItemMapping(ItemData.runeliteKeyList()['CRYSTAL_TOOL_SEED'], ItemData.runeliteKeyList()['CRYSTAL_AXE'], ItemData.runeliteKeyList()['CRYSTAL_AXE_INACTIVE'], ItemData.runeliteKeyList()['CRYSTAL_HARPOON'], ItemData.runeliteKeyList()['CRYSTAL_HARPOON_INACTIVE'], ItemData.runeliteKeyList()['CRYSTAL_PICKAXE'], ItemData.runeliteKeyList()['CRYSTAL_PICKAXE_INACTIVE']);
	itemMappings.ITEM_CRYSTAL_AXE = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_AXE'], ItemData.runeliteKeyList()['CRYSTAL_AXE'], ItemData.runeliteKeyList()['CRYSTAL_AXE_INACTIVE']);
	itemMappings.ITEM_CRYSTAL_HARPOON = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_HARPOON'], ItemData.runeliteKeyList()['CRYSTAL_HARPOON'], ItemData.runeliteKeyList()['CRYSTAL_HARPOON_INACTIVE']);
	itemMappings.ITEM_CRYSTAL_PICKAXE = new ItemMapping(ItemData.runeliteKeyList()['DRAGON_PICKAXE'], ItemData.runeliteKeyList()['CRYSTAL_PICKAXE'], ItemData.runeliteKeyList()['CRYSTAL_PICKAXE_INACTIVE']);
	itemMappings.ITEM_BLADE_OF_SAELDOR = new ItemMapping(ItemData.runeliteKeyList()['BLADE_OF_SAELDOR_INACTIVE'], true, 1, ItemData.runeliteKeyList()['BLADE_OF_SAELDOR']);
	itemMappings.ITEM_CRYSTAL_BOW = new ItemMapping(ItemData.runeliteKeyList()['CRYSTAL_WEAPON_SEED'], ItemData.runeliteKeyList()['CRYSTAL_BOW'], ItemData.runeliteKeyList()['CRYSTAL_BOW_24123'], ItemData.runeliteKeyList()['CRYSTAL_BOW_INACTIVE']);
	itemMappings.ITEM_CRYSTAL_HALBERD = new ItemMapping(ItemData.runeliteKeyList()['CRYSTAL_WEAPON_SEED'], ItemData.runeliteKeyList()['CRYSTAL_HALBERD'], ItemData.runeliteKeyList()['CRYSTAL_HALBERD_24125'], ItemData.runeliteKeyList()['CRYSTAL_HALBERD_INACTIVE']);
	itemMappings.ITEM_CRYSTAL_SHIELD = new ItemMapping(ItemData.runeliteKeyList()['CRYSTAL_WEAPON_SEED'], ItemData.runeliteKeyList()['CRYSTAL_SHIELD'], ItemData.runeliteKeyList()['CRYSTAL_SHIELD_24127'], ItemData.runeliteKeyList()['CRYSTAL_SHIELD_INACTIVE']);
	itemMappings.ITEM_CRYSTAL_HELMET = new ItemMapping(ItemData.runeliteKeyList()['CRYSTAL_ARMOUR_SEED'], true, 1, ItemData.runeliteKeyList()['CRYSTAL_HELM']);
	itemMappings.ITEM_CRYSTAL_LEGS = new ItemMapping(ItemData.runeliteKeyList()['CRYSTAL_ARMOUR_SEED'], true, 2, ItemData.runeliteKeyList()['CRYSTAL_LEGS']);
	itemMappings.ITEM_CRYSTAL_BODY = new ItemMapping(ItemData.runeliteKeyList()['CRYSTAL_ARMOUR_SEED'], true, 3, ItemData.runeliteKeyList()['CRYSTAL_BODY']);
	itemMappings.ITEM_BOW_OF_FAERDHINEN = new ItemMapping(ItemData.runeliteKeyList()['BOW_OF_FAERDHINEN_INACTIVE'], true, 1, ItemData.runeliteKeyList()['BOW_OF_FAERDHINEN']);

	// Bird nests
	itemMappings.ITEM_BIRD_NEST = new ItemMapping(ItemData.runeliteKeyList()['BIRD_NEST_5075'], ItemData.runeliteKeyList()['BIRD_NEST'], ItemData.runeliteKeyList()['BIRD_NEST_5071'], ItemData.runeliteKeyList()['BIRD_NEST_5072'], ItemData.runeliteKeyList()['BIRD_NEST_5073'], ItemData.runeliteKeyList()['BIRD_NEST_5074'], ItemData.runeliteKeyList()['BIRD_NEST_7413'], ItemData.runeliteKeyList()['BIRD_NEST_13653'], ItemData.runeliteKeyList()['BIRD_NEST_22798'], ItemData.runeliteKeyList()['BIRD_NEST_22800'], ItemData.runeliteKeyList()['CLUE_NEST_EASY'], ItemData.runeliteKeyList()['CLUE_NEST_MEDIUM'], ItemData.runeliteKeyList()['CLUE_NEST_HARD'], ItemData.runeliteKeyList()['CLUE_NEST_ELITE']);

	// Ancestral robes
	itemMappings.ITEM_ANCESTRAL_HAT = new ItemMapping(ItemData.runeliteKeyList()['ANCESTRAL_HAT'], ItemData.runeliteKeyList()['TWISTED_ANCESTRAL_HAT']);
	itemMappings.ITEM_ANCESTRAL_ROBE_TOP = new ItemMapping(ItemData.runeliteKeyList()['ANCESTRAL_ROBE_TOP'], ItemData.runeliteKeyList()['TWISTED_ANCESTRAL_ROBE_TOP']);
	itemMappings.ITEM_ANCESTRAL_ROBE_BOTTOM = new ItemMapping(ItemData.runeliteKeyList()['ANCESTRAL_ROBE_BOTTOM'], ItemData.runeliteKeyList()['TWISTED_ANCESTRAL_ROBE_BOTTOM']);

	// Torva armor
	itemMappings.ITEM_TORVA_FULL_HELM = new ItemMapping(ItemData.runeliteKeyList()['TORVA_FULL_HELM'], ItemData.runeliteKeyList()['SANGUINE_TORVA_FULL_HELM']);
	itemMappings.ITEM_TORVA_PLATEBODY = new ItemMapping(ItemData.runeliteKeyList()['TORVA_PLATEBODY'], ItemData.runeliteKeyList()['SANGUINE_TORVA_PLATEBODY']);
	itemMappings.ITEM_TORVA_PLATELEGS = new ItemMapping(ItemData.runeliteKeyList()['TORVA_PLATELEGS'], ItemData.runeliteKeyList()['SANGUINE_TORVA_PLATELEGS']);

	// Graceful
	itemMappings.ITEM_MARK_OF_GRACE = new ItemMapping(ItemData.runeliteKeyList()['AMYLASE_CRYSTAL'], true, 10, ItemData.runeliteKeyList()['MARK_OF_GRACE']);
	itemMappings.ITEM_GRACEFUL_HOOD = new ItemMapping(ItemData.runeliteKeyList()['MARK_OF_GRACE'], true, 28, ItemData.runeliteKeyList()['GRACEFUL_HOOD']);
	itemMappings.ITEM_GRACEFUL_TOP = new ItemMapping(ItemData.runeliteKeyList()['MARK_OF_GRACE'], true, 44, ItemData.runeliteKeyList()['GRACEFUL_TOP']);
	itemMappings.ITEM_GRACEFUL_LEGS = new ItemMapping(ItemData.runeliteKeyList()['MARK_OF_GRACE'], true, 48, ItemData.runeliteKeyList()['GRACEFUL_LEGS']);
	itemMappings.ITEM_GRACEFUL_GLOVES = new ItemMapping(ItemData.runeliteKeyList()['MARK_OF_GRACE'], true, 24, ItemData.runeliteKeyList()['GRACEFUL_GLOVES']);
	itemMappings.ITEM_GRACEFUL_BOOTS = new ItemMapping(ItemData.runeliteKeyList()['MARK_OF_GRACE'], true, 32, ItemData.runeliteKeyList()['GRACEFUL_BOOTS']);
	itemMappings.ITEM_GRACEFUL_CAPE = new ItemMapping(ItemData.runeliteKeyList()['MARK_OF_GRACE'], true, 32, ItemData.runeliteKeyList()['GRACEFUL_CAPE']);

	// Trailblazer Graceful Ornament Kit
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_HOOD = new ItemMapping(ItemData.runeliteKeyList()['TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'], ItemData.runeliteKeyList()['GRACEFUL_HOOD_25069']);
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_TOP = new ItemMapping(ItemData.runeliteKeyList()['TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'], ItemData.runeliteKeyList()['GRACEFUL_TOP_25075']);
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_LEGS = new ItemMapping(ItemData.runeliteKeyList()['TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'], ItemData.runeliteKeyList()['GRACEFUL_LEGS_25078']);
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_GLOVES = new ItemMapping(ItemData.runeliteKeyList()['TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'], ItemData.runeliteKeyList()['GRACEFUL_GLOVES_25081']);
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_BOOTS = new ItemMapping(ItemData.runeliteKeyList()['TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'], ItemData.runeliteKeyList()['GRACEFUL_BOOTS_25084']);
	itemMappings.ITEM_TRAILBLAZER_GRACEFUL_CAPE = new ItemMapping(ItemData.runeliteKeyList()['TRAILBLAZER_GRACEFUL_ORNAMENT_KIT'], ItemData.runeliteKeyList()['GRACEFUL_CAPE_25072']);

	// 10 golden nuggets = 100 soft clay
	itemMappings.ITEM_GOLDEN_NUGGET = new ItemMapping(ItemData.runeliteKeyList()['SOFT_CLAY'], true, 10, ItemData.runeliteKeyList()['GOLDEN_NUGGET']);
	itemMappings.ITEM_PROSPECTOR_HELMET = new ItemMapping(ItemData.runeliteKeyList()['GOLDEN_NUGGET'], true, 32, ItemData.runeliteKeyList()['PROSPECTOR_HELMET']);
	itemMappings.ITEM_PROSPECTOR_JACKET = new ItemMapping(ItemData.runeliteKeyList()['GOLDEN_NUGGET'], true, 48, ItemData.runeliteKeyList()['PROSPECTOR_JACKET']);
	itemMappings.ITEM_PROSPECTOR_LEGS = new ItemMapping(ItemData.runeliteKeyList()['GOLDEN_NUGGET'], true, 40, ItemData.runeliteKeyList()['PROSPECTOR_LEGS']);
	itemMappings.ITEM_PROSPECTOR_BOOTS = new ItemMapping(ItemData.runeliteKeyList()['GOLDEN_NUGGET'], true, 24, ItemData.runeliteKeyList()['PROSPECTOR_BOOTS']);

	// 10 unidentified minerals = 100 soft clay
	itemMappings.ITEM_UNIDENTIFIED_MINERALS = new ItemMapping(ItemData.runeliteKeyList()['SOFT_CLAY'], true, 10, ItemData.runeliteKeyList()['UNIDENTIFIED_MINERALS']);

	// Converted to coins
	itemMappings.ITEM_TATTERED_PAGE = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], true, 1000, ItemData.runeliteKeyList()['TATTERED_MOON_PAGE'], ItemData.runeliteKeyList()['TATTERED_SUN_PAGE'], ItemData.runeliteKeyList()['TATTERED_TEMPLE_PAGE']);
	itemMappings.ITEM_LONG_BONE = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], true, 1000, ItemData.runeliteKeyList()['LONG_BONE']);
	itemMappings.ITEM_CURVED_BONE = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], true, 2000, ItemData.runeliteKeyList()['CURVED_BONE']);
	itemMappings.ITEM_PERFECT_SHELL = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], true, 600, ItemData.runeliteKeyList()['PERFECT_SHELL']);
	itemMappings.ITEM_PERFECT_SNAIL_SHELL = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], true, 600, ItemData.runeliteKeyList()['PERFECT_SNAIL_SHELL']);
	itemMappings.ITEM_SNAIL_SHELL = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], true, 600, ItemData.runeliteKeyList()['SNAIL_SHELL']);
	itemMappings.ITEM_TORTOISE_SHELL = new ItemMapping(ItemData.runeliteKeyList()['COINS_995'], true, 250, ItemData.runeliteKeyList()['TORTOISE_SHELL']);

	
	return itemMappings;
	}
}