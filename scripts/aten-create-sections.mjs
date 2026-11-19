import fs from "fs";
import path from "path";

const sectionsPath = path.join("data", "sections.json");
const mapPath = path.join("data", "microinform", "section-map.json");
const settingsPath = path.join("data", "microinform", "settings.json");

const sections = JSON.parse(fs.readFileSync(sectionsPath, "utf8"));
let nextId = Math.max(...sections.map((s) => s.id)) + 1;

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

const kvmFilters = [
  "brand",
  "price",
  "char:Тип",
  "char:ПК",
  "char:Видео",
  "char:Периферия",
  "char:Разрешение",
  "char:Монтаж",
  "char:Кабель",
  "char:Длина",
];
const avFilters = [
  "brand",
  "price",
  "char:Тип",
  "char:Видео",
  "char:Разрешение",
  "char:Длина",
];

const ids = {
  kvmParent: nextId++,
  kvmConsoles: nextId++,
  kvmExtenders: nextId++,
  kvmCables: nextId++,
  kvmModules: nextId++,
  avParent: nextId++,
  avExtenders: nextId++,
  avMatrix: nextId++,
  avSwitches: nextId++,
  avSplitters: nextId++,
  avConverters: nextId++,
  avCables: nextId++,
};

const created = [
  makeSection({
    id: ids.kvmParent,
    name: "KVM",
    parent: 293,
    externalId: "kvm",
    level: 3,
    sort: 1190,
  }),
  makeSection({
    id: ids.kvmConsoles,
    name: "Консоли KVM",
    parent: ids.kvmParent,
    externalId: "konsoli-kvm",
    level: 4,
    sort: 100,
    selectedFilters: kvmFilters,
  }),
  makeSection({
    id: ids.kvmExtenders,
    name: "Удлинители KVM",
    parent: ids.kvmParent,
    externalId: "udliniteli-kvm",
    level: 4,
    sort: 200,
    selectedFilters: kvmFilters,
  }),
  makeSection({
    id: ids.kvmCables,
    name: "Кабели KVM",
    parent: ids.kvmParent,
    externalId: "kabeli-kvm",
    level: 4,
    sort: 300,
    selectedFilters: kvmFilters,
  }),
  makeSection({
    id: ids.kvmModules,
    name: "Модули и аксессуары KVM",
    parent: ids.kvmParent,
    externalId: "moduli-i-aksessuary-kvm",
    level: 4,
    sort: 400,
    selectedFilters: kvmFilters,
  }),
  makeSection({
    id: ids.avParent,
    name: "Профессиональное A/V оборудование",
    parent: 257,
    externalId: "professionalnoe-av-oborudovanie",
    level: 2,
    sort: 850,
  }),
  makeSection({
    id: ids.avExtenders,
    name: "Видеоудлинители",
    parent: ids.avParent,
    externalId: "videoudliniteli",
    level: 3,
    sort: 100,
    selectedFilters: avFilters,
  }),
  makeSection({
    id: ids.avMatrix,
    name: "Матричные видеокоммутаторы",
    parent: ids.avParent,
    externalId: "matrichnye-videokommutatory",
    level: 3,
    sort: 200,
    selectedFilters: avFilters,
  }),
  makeSection({
    id: ids.avSwitches,
    name: "Переключатели видеосигнала",
    parent: ids.avParent,
    externalId: "pereklyuchateli-videosignala",
    level: 3,
    sort: 300,
    selectedFilters: avFilters,
  }),
  makeSection({
    id: ids.avSplitters,
    name: "Разветвители видеосигнала",
    parent: ids.avParent,
    externalId: "razvetviteli-videosignala",
    level: 3,
    sort: 400,
    selectedFilters: avFilters,
  }),
  makeSection({
    id: ids.avConverters,
    name: "Видеоконвертеры и адаптеры",
    parent: ids.avParent,
    externalId: "videokonvertery-i-adaptery",
    level: 3,
    sort: 500,
    selectedFilters: avFilters,
  }),
  makeSection({
    id: ids.avCables,
    name: "Кабели A/V",
    parent: ids.avParent,
    externalId: "kabeli-av",
    level: 3,
    sort: 600,
    selectedFilters: avFilters,
  }),
];

const s641 = sections.find((s) => s.id === 641);
if (!s641) throw new Error("section 641 missing");
s641.parent = ids.kvmParent;
s641.metadata = {
  ...s641.metadata,
  parent_id: ids.kvmParent,
  level: 4,
  sort: 50,
};

const existingIds = new Set(sections.map((s) => s.id));
for (const s of created) {
  if (existingIds.has(s.id)) throw new Error("id collision " + s.id);
  sections.push(s);
}

fs.writeFileSync(sectionsPath, JSON.stringify(sections, null, 2), "utf8");

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
Object.assign(map, {
  "ATEN USB устройства": { action: "existing", sectionId: 640 },
  "ATEN Настольные КВМ переключатели": { action: "existing", sectionId: 641 },
  "ATEN Стоечные КВМ переключатели": { action: "existing", sectionId: 641 },
  "ATEN Консоли": { action: "existing", sectionId: ids.kvmConsoles },
  "ATEN Удлинители консоли": { action: "existing", sectionId: ids.kvmExtenders },
  "ATEN Кабели для КВМ-переключателей": { action: "existing", sectionId: ids.kvmCables },
  "ATEN (системы управления IT инфраструктурой )": {
    action: "existing",
    sectionId: ids.kvmModules,
  },
  // Placeholder; per-SKU reclassify in section-hints.
  "ATEN Серия устройств Altusen": { action: "existing", sectionId: 641 },
  "ATEN Профессиональные A/V решения": {
    action: "existing",
    sectionId: ids.avExtenders,
  },
  "ATEN Профессиональные A/V решения ПРОМО": {
    action: "existing",
    sectionId: ids.avExtenders,
  },
  "!!!ATEN проданное": { action: "skip" },
});
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), "utf8");

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
if (!settings.enabledVendors.includes("ATEN")) settings.enabledVendors.push("ATEN");
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");

fs.writeFileSync(
  path.join("data", "microinform", "aten-section-ids.json"),
  JSON.stringify(ids, null, 2),
  "utf8",
);
console.log(JSON.stringify(ids, null, 2));
