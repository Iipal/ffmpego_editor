import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

export interface MobileSlice {
  isLoopEnabled: boolean;
}

export const initialMobileSlice: MobileSlice = {
  isLoopEnabled: false,
};

export const mobileStore = createStore<MobileSlice>(initialMobileSlice);

export function useMobileStore() {
  return useSelector(mobileStore);
}

export function setMobileState(
  updater: (previous: MobileSlice) => MobileSlice,
) {
  mobileStore.setState(updater);
}
