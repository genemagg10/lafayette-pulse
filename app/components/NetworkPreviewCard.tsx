"use client";

import WhoNetworkCard from "./WhoNetworkCard";
import {
  whoNetworkSchematic,
  type WhoNetworkDoor,
} from "@/lib/network-preview";

/**
 * Selected-person / selected-org door. Same frame as the list overview.
 * Person: oak circle at center. Org: oak square at center.
 */
export default function NetworkPreviewCard({
  label,
  door,
  onOpen,
}: {
  label: string;
  door: Extract<WhoNetworkDoor, "person" | "org">;
  onOpen: () => void;
}) {
  return (
    <WhoNetworkCard
      label={label}
      schematic={whoNetworkSchematic(door)}
      onOpen={onOpen}
    />
  );
}
