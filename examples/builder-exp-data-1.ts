import type { Component } from "mozithermodb-settings";
import { buildData, buildComponentData, buildComponentsData } from "mozithermodb";
import type { RawThermoRecord } from "mozithermodb";

const methane = { name: "Methane", formula: "CH4", state: "g" } as Component;
const ethane = { name: "Ethane", formula: "C2H6", state: "g" } as Component;

const methaneRecords: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "Methane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "CH4", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "Tc", symbol: "Tc", value: 190.56, unit: "K" },
  { name: "Pc", symbol: "Pc", value: 45.99e5, unit: "Pa" },
  { name: "AcFa", symbol: "AcFa", value: 0.011, unit: "-" }
];

const ethaneRecords: RawThermoRecord[] = [
  { name: "Name", symbol: "Name", value: "Ethane", unit: "" },
  { name: "Formula", symbol: "Formula", value: "C2H6", unit: "" },
  { name: "State", symbol: "State", value: "g", unit: "" },
  { name: "Tc", symbol: "Tc", value: 305.32, unit: "K" },
  { name: "Pc", symbol: "Pc", value: 48.72e5, unit: "Pa" },
  { name: "AcFa", symbol: "AcFa", value: 0.099, unit: "-" }
];

// New in mozithermodb v1.0.1: buildData
const methaneData = buildData(methaneRecords, "Methane thermo data");
console.log("buildData symbols:", Object.keys(methaneData));
console.log("buildData Tc:", methaneData.Tc);

const methaneComponentData = buildComponentData(
  methane,
  methaneRecords,
  ["Name-State", "Name-Formula"],
  true,
  "Name-Formula"
);
console.log("buildComponentData keys:", Object.keys(methaneComponentData));

const componentsData = buildComponentsData(
  [methane, ethane],
  [methaneRecords, ethaneRecords],
  ["Name-State", "Name-Formula"],
  true,
  "Name-Formula"
);
console.log("buildComponentsData keys:", Object.keys(componentsData));

