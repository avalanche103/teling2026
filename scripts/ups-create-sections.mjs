import fs from "fs";
import path from "path";

const sectionsPath = path.join("data", "sections.json");
const mapPath = path.join("data", "microinform", "section-map.json");
const settingsPath = path.join("data", "microinform", "settings.json");

const sections = JSON.parse(fs.readFileSync(sectionsPath, "utf8"));

const UPS_FILTERS = [
  "brand",
  "price",
  "char:Тип",
  "char:Мощность",
  "char:Фазы",
  "char:Форм-фактор",
];
const BATTERY_FILTERS = ["brand", "price", "char:Тип", "char:Монтаж"];
const ACCESSORY_FILTERS = ["brand", "price", "char:Тип", "char:Монтаж"];
const PDU_FILTERS = ["brand", "price", "char:Тип", "char:Монтаж"];

function makeSection({
  id,
  name,
  parent,
  externalId,
  level,
  sort,
  selectedFilters = ["brand", "price"],
}) {
  return {
    id,
    name,
    parent,
    external_id: externalId,
    metadata: {
      id,
      name,
      sort,
      code: externalId,
      url: "",
      level,
      parent_id: parent,
      picture: "",
      selected_filters: selectedFilters,
      source: "microinform",
    },
  };
}

function mergeFilters(section, filters) {
  const prev = Array.isArray(section.metadata?.selected_filters)
    ? section.metadata.selected_filters
    : [];
  const merged = [...prev];
  for (const f of filters) {
    if (!merged.includes(f)) merged.push(f);
  }
  section.metadata = {
    ...(section.metadata || {}),
    selected_filters: merged,
  };
}

const ids = {
  ups: 519,
  batteries: 520,
  pdu: 508,
  inverters: 665,
  bypass: 666,
  mgmt: 667,
  mounts: 668,
};

const created = [
  makeSection({
    id: ids.inverters,
    name: "Инверторы",
    parent: 292,
    externalId: "invertory",
    level: 3,
    sort: 1100,
    selectedFilters: ACCESSORY_FILTERS,
  }),
  makeSection({
    id: ids.bypass,
    name: "Байпасные панели",
    parent: 292,
    externalId: "baypasnye-paneli",
    level: 3,
    sort: 1200,
    selectedFilters: ACCESSORY_FILTERS,
  }),
  makeSection({
    id: ids.mgmt,
    name: "Модули управления ИБП",
    parent: 292,
    externalId: "moduli-upravleniya-ibp",
    level: 3,
    sort: 1300,
    selectedFilters: ACCESSORY_FILTERS,
  }),
  makeSection({
    id: ids.mounts,
    name: "Монтажные комплекты ИБП",
    parent: 292,
    externalId: "montazhnye-komplekty-ibp",
    level: 3,
    sort: 1400,
    selectedFilters: ACCESSORY_FILTERS,
  }),
];

const existingIds = new Set(sections.map((s) => s.id));
for (const s of created) {
  if (existingIds.has(s.id)) throw new Error("id collision " + s.id);
  sections.push(s);
}

const s519 = sections.find((s) => s.id === 519);
const s520 = sections.find((s) => s.id === 520);
const s508 = sections.find((s) => s.id === 508);
if (!s519 || !s520 || !s508) throw new Error("UPS shared sections 519/520/508 missing");
mergeFilters(s519, UPS_FILTERS);
mergeFilters(s520, BATTERY_FILTERS);
mergeFilters(s508, PDU_FILTERS);

fs.writeFileSync(sectionsPath, JSON.stringify(sections, null, 2), "utf8");

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
Object.assign(map, {
  // INFORMIX — mixed header with battery/bypass SKUs
  "(1) INFORMIX (источники бесперебойного питания)": {
    action: "existing",
    sectionId: ids.ups,
  },
  "INFORMIX Back UPS (линейно-интерактивные)": {
    action: "existing",
    sectionId: ids.ups,
  },
  "INFORMIX Онлайн (стоечные)": { action: "existing", sectionId: ids.ups },
  "INFORMIX Онлайн 3Ф (стоечные)": { action: "existing", sectionId: ids.ups },
  "INFROMIX Онлайн (напольные)": { action: "existing", sectionId: ids.ups },

  // Systeme — single mixed bucket, per-SKU reclassify
  "(4) Systeme Electric": { action: "existing", sectionId: ids.ups },

  // SVC series → UPS
  "SVC new серия V-R (напольные, AVR, управление)": {
    action: "existing",
    sectionId: ids.ups,
  },
  "SVC U-серия (AVR, много розеток)": { action: "existing", sectionId: ids.ups },
  "SVC W-серия (AVR, чистая синусоида, LCD)": {
    action: "existing",
    sectionId: ids.ups,
  },
  "SVC Smart-UPS (Стоечные)": { action: "existing", sectionId: ids.ups },
  "SVC PTS-серия (Онлайн, AVR, 1Ф-1Ф)": { action: "existing", sectionId: ids.ups },
  "SVC RTS-серия (Онлайн, AVR, 1Ф-1Ф)": { action: "existing", sectionId: ids.ups },
  "SVC RT-серия (Онлайн, AVR, 1Ф-1Ф)": { action: "existing", sectionId: ids.ups },
  "SVC TRX11-серия (Онлайн, AVR, 1Ф-1Ф)": {
    action: "existing",
    sectionId: ids.ups,
  },

  // SVC accessories
  "SVC Батарейные блоки": { action: "existing", sectionId: ids.batteries },
  "SVC Инверторы": { action: "existing", sectionId: ids.inverters },
  "SVC Модули управления": { action: "existing", sectionId: ids.mgmt },
  "SVC Монтажные комплекты": { action: "existing", sectionId: ids.mounts },
  "SVC Опции": { action: "existing", sectionId: ids.bypass },
  "SVC Распределители питания (PDU)": { action: "existing", sectionId: ids.pdu },
});
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), "utf8");

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
for (const vendor of ["SVC", "INFORMIX", "Systeme Electric"]) {
  if (!settings.enabledVendors.includes(vendor)) {
    settings.enabledVendors.push(vendor);
  }
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");

fs.writeFileSync(
  path.join("data", "microinform", "ups-section-ids.json"),
  JSON.stringify(ids, null, 2),
  "utf8",
);
console.log(JSON.stringify(ids, null, 2));
