"use client";

import WhoNetworkCard from "./WhoNetworkCard";
import { whoNetworkSchematic } from "@/lib/network-preview";

/**
 * Mobile list door to the existing unselected overview graph.
 * Same card family as the person/org doors — overview drawing, no ego.
 */
export default function NetworkListDoor({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  return (
    <WhoNetworkCard
      label={label}
      schematic={whoNetworkSchematic("list")}
      onOpen={onOpen}
    />
  );
}
