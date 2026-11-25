import type { ProductCharGroup } from "@/lib/types";
import type { CatalogGroup } from "../section-hints";
import { CATALOG_SECTION_IDS } from "../section-hints";
import {
  isSwitchProduct,
  refineSwitchCharGroups,
  SWITCH_SELECTED_FILTERS,
} from "../switch-chars";
import {
  ADAPTER_SELECTED_FILTERS,
  KVM_SELECTED_FILTERS,
  refineAdapterCharGroups,
  refineKvmCharGroups,
  refineUsbCharGroups,
  USB_SELECTED_FILTERS,
} from "./io-group";
import {
  DAC_SELECTED_FILTERS,
  MEDIA_CONVERTER_SELECTED_FILTERS,
  MODULE_SELECTED_FILTERS,
  refineDacCharGroups,
  refineMediaConverterCharGroups,
  refineModuleCharGroups,
} from "./optics";
import {
  POE_SELECTED_FILTERS,
  POWER_SUPPLY_SELECTED_FILTERS,
  refinePoeCharGroups,
  refinePowerSupplyCharGroups,
} from "./power-group";
import {
  CAMERA_SELECTED_FILTERS,
  GPON_SELECTED_FILTERS,
  refineCameraCharGroups,
  refineGponCharGroups,
  refineSoftwareCharGroups,
  refineVoipCharGroups,
  refineXdslCharGroups,
  SOFTWARE_SELECTED_FILTERS,
  VOIP_SELECTED_FILTERS,
  XDSL_SELECTED_FILTERS,
} from "./small-group";
import {
  PDU_SELECTED_FILTERS,
  refinePduCharGroups,
  refineUpsBatteryCharGroups,
  refineUpsBypassCharGroups,
  refineUpsCharGroups,
  refineUpsInverterCharGroups,
  refineUpsMgmtCharGroups,
  refineUpsMountCharGroups,
  UPS_ACCESSORY_SELECTED_FILTERS,
  UPS_BATTERY_SELECTED_FILTERS,
  UPS_SELECTED_FILTERS,
} from "./ups-group";
import {
  refineRouterCharGroups,
  refineWirelessCharGroups,
  ROUTER_SELECTED_FILTERS,
  WIRELESS_SELECTED_FILTERS,
} from "./wireless-group";
import {
  INDUSTRIAL_ACCESSORIES_SELECTED_FILTERS,
  refineIndustrialAccessoriesCharGroups,
  refineSerialConvertersCharGroups,
  refineSerialEthernetCharGroups,
  refineSerialGatewaysBoardsCharGroups,
  SERIAL_CONVERTERS_SELECTED_FILTERS,
  SERIAL_ETHERNET_SELECTED_FILTERS,
  SERIAL_GATEWAYS_BOARDS_SELECTED_FILTERS,
} from "./moxa-group";

export type ActiveNetworkGroup = Exclude<CatalogGroup, "mixed" | "skip">;

type RefineFn = (
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
) => ProductCharGroup[];

const REFINERS: Record<ActiveNetworkGroup, RefineFn> = {
  switches: refineSwitchCharGroups,
  modules: refineModuleCharGroups,
  dac: refineDacCharGroups,
  media_converters: refineMediaConverterCharGroups,
  wireless: refineWirelessCharGroups,
  routers: refineRouterCharGroups,
  poe: refinePoeCharGroups,
  power_supplies: refinePowerSupplyCharGroups,
  kvm: refineKvmCharGroups,
  kvm_consoles: refineKvmCharGroups,
  kvm_extenders: refineKvmCharGroups,
  kvm_cables: refineKvmCharGroups,
  kvm_modules: refineKvmCharGroups,
  adapters: refineAdapterCharGroups,
  usb: refineUsbCharGroups,
  cameras: refineCameraCharGroups,
  xdsl: refineXdslCharGroups,
  voip: refineVoipCharGroups,
  gpon: refineGponCharGroups,
  software: refineSoftwareCharGroups,
  av_extenders: refineKvmCharGroups,
  av_matrix: refineKvmCharGroups,
  av_switches: refineKvmCharGroups,
  av_splitters: refineKvmCharGroups,
  av_converters: refineAdapterCharGroups,
  av_cables: refineKvmCharGroups,
  ups: refineUpsCharGroups,
  ups_batteries: refineUpsBatteryCharGroups,
  ups_inverters: refineUpsInverterCharGroups,
  ups_bypass: refineUpsBypassCharGroups,
  ups_mgmt: refineUpsMgmtCharGroups,
  ups_mounts: refineUpsMountCharGroups,
  pdu: refinePduCharGroups,
  serial_ethernet: refineSerialEthernetCharGroups,
  serial_converters: refineSerialConvertersCharGroups,
  serial_gateways_boards: refineSerialGatewaysBoardsCharGroups,
  industrial_accessories: refineIndustrialAccessoriesCharGroups,
};

export const SELECTED_FILTERS_BY_GROUP: Record<ActiveNetworkGroup, string[]> = {
  switches: SWITCH_SELECTED_FILTERS,
  modules: MODULE_SELECTED_FILTERS,
  dac: DAC_SELECTED_FILTERS,
  media_converters: MEDIA_CONVERTER_SELECTED_FILTERS,
  wireless: WIRELESS_SELECTED_FILTERS,
  routers: ROUTER_SELECTED_FILTERS,
  poe: POE_SELECTED_FILTERS,
  power_supplies: POWER_SUPPLY_SELECTED_FILTERS,
  kvm: KVM_SELECTED_FILTERS,
  kvm_consoles: KVM_SELECTED_FILTERS,
  kvm_extenders: KVM_SELECTED_FILTERS,
  kvm_cables: KVM_SELECTED_FILTERS,
  kvm_modules: KVM_SELECTED_FILTERS,
  adapters: ADAPTER_SELECTED_FILTERS,
  usb: USB_SELECTED_FILTERS,
  cameras: CAMERA_SELECTED_FILTERS,
  xdsl: XDSL_SELECTED_FILTERS,
  voip: VOIP_SELECTED_FILTERS,
  gpon: GPON_SELECTED_FILTERS,
  software: SOFTWARE_SELECTED_FILTERS,
  av_extenders: KVM_SELECTED_FILTERS,
  av_matrix: KVM_SELECTED_FILTERS,
  av_switches: KVM_SELECTED_FILTERS,
  av_splitters: KVM_SELECTED_FILTERS,
  av_converters: ADAPTER_SELECTED_FILTERS,
  av_cables: KVM_SELECTED_FILTERS,
  ups: UPS_SELECTED_FILTERS,
  ups_batteries: UPS_BATTERY_SELECTED_FILTERS,
  ups_inverters: UPS_ACCESSORY_SELECTED_FILTERS,
  ups_bypass: UPS_ACCESSORY_SELECTED_FILTERS,
  ups_mgmt: UPS_ACCESSORY_SELECTED_FILTERS,
  ups_mounts: UPS_ACCESSORY_SELECTED_FILTERS,
  pdu: PDU_SELECTED_FILTERS,
  serial_ethernet: SERIAL_ETHERNET_SELECTED_FILTERS,
  serial_converters: SERIAL_CONVERTERS_SELECTED_FILTERS,
  serial_gateways_boards: SERIAL_GATEWAYS_BOARDS_SELECTED_FILTERS,
  industrial_accessories: INDUSTRIAL_ACCESSORIES_SELECTED_FILTERS,
};

const SECTION_ID_TO_GROUP = new Map<number, ActiveNetworkGroup>(
  (Object.entries(CATALOG_SECTION_IDS) as Array<[ActiveNetworkGroup, number]>).map(
    ([group, id]) => [id, group],
  ),
);

export function groupForSectionId(sectionId: number): ActiveNetworkGroup | null {
  return SECTION_ID_TO_GROUP.get(sectionId) ?? null;
}

export function refineActiveNetworkChars(
  group: CatalogGroup,
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  if (group === "skip" || group === "mixed") return chars || [];
  const refine = REFINERS[group];
  return refine(sectionTitle, name, articul, chars);
}

export function isActiveNetworkProduct(product: {
  section_id?: number;
  section_name?: string;
  metadata?: { type?: string };
}): boolean {
  if (isSwitchProduct(product)) return true;
  if (product.section_id && SECTION_ID_TO_GROUP.has(product.section_id)) return true;
  return false;
}

export function resolveActiveNetworkGroup(product: {
  section_id?: number;
  section_name?: string;
  metadata?: { type?: string };
}): ActiveNetworkGroup | null {
  if (product.section_id) {
    const byId = groupForSectionId(product.section_id);
    if (byId) return byId;
  }
  if (isSwitchProduct(product)) return "switches";
  return null;
}

export function selectedFiltersForGroup(group: CatalogGroup): string[] {
  if (group === "skip" || group === "mixed") return ["brand", "price"];
  return SELECTED_FILTERS_BY_GROUP[group] || ["brand", "price"];
}
