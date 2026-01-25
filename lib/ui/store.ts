import { create } from "zustand";

export type Zone = "bin" | "storage" | "shipping" | "rejected" | "surplus";

export type ZoneFilters = Record<Zone, boolean>;

const defaultZones: ZoneFilters = {
  bin: true,
  storage: true,
  shipping: true,
  rejected: true,
  surplus: true,
};

type UIState = {
  zoneFilters: ZoneFilters;
  setOnlyZone: (zone: Zone) => void;
  toggleZone: (zone: Zone) => void;
  resetZones: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  zoneFilters: { ...defaultZones },
  setOnlyZone: (zone) =>
    set(() => ({
      zoneFilters: {
        bin: zone === "bin",
        storage: zone === "storage",
        shipping: zone === "shipping",
        rejected: zone === "rejected",
        surplus: zone === "surplus",
      },
    })),
  toggleZone: (zone) =>
    set((state) => ({
      zoneFilters: {
        ...state.zoneFilters,
        [zone]: !state.zoneFilters[zone],
      },
    })),
  resetZones: () => set(() => ({ zoneFilters: { ...defaultZones } })),
}));
