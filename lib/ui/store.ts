import { create } from "zustand";

export type Zone = "receiving" | "bin" | "storage" | "shipping" | "transfer" | "rejected";

export type ZoneFilters = Record<Zone, boolean>;

const defaultZones: ZoneFilters = {
  receiving: true,
  bin: true,
  storage: true,
  shipping: true,
  transfer: true,
  rejected: true,
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
        receiving: zone === "receiving",
        bin: zone === "bin",
        storage: zone === "storage",
        shipping: zone === "shipping",
        transfer: zone === "transfer",
        rejected: zone === "rejected",
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
