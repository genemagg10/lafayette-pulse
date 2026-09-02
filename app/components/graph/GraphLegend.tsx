import {
  ORG_TYPE_COLORS,
  PERSON_COLOR,
  SEAT_COLOR,
} from "@/lib/civic-graph";
import {
  STANCE_GOLD,
  STANCE_INSUFFICIENT,
  STANCE_TEAL,
  STANCE_VERMILLION,
} from "@/lib/stances";
import { ORG_TYPE_LABELS, type OrgType } from "@/lib/types";

const ORG_TYPES = Object.keys(ORG_TYPE_LABELS) as OrgType[];

export default function GraphLegend({
  showSeats = true,
  affinity = false,
  stance = false,
}: {
  showSeats?: boolean;
  affinity?: boolean;
  stance?: boolean;
}) {
  if (stance && !affinity) {
    return (
      <div className="flex flex-col gap-2 text-[11px] font-body text-forest-600">
        <StanceLegendItems insufficient={false} />
        <p>
          Size follows evidence confidence. Color is not red/green alone.
          Co-stance is shared support or oppose — not allies.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-[11px] font-body text-forest-600">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {!affinity && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: PERSON_COLOR }}
            />
            Person
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-[3px]"
            style={{ background: ORG_TYPE_COLORS.city_body }}
          />
          Organization
        </span>
        {showSeats && !affinity && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rotate-45"
              style={{ background: SEAT_COLOR }}
            />
            Seat
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {affinity ? (
          <span>Line weight = overlapping membership</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-6 border-t-2 border-forest-700" />
              Current
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-6 border-t-2 border-dashed border-forest-400" />
              Past
            </span>
            <span>Thick = primary role or seated</span>
          </>
        )}
      </div>
      {stance && affinity && <StanceLegendItems insufficient />}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {ORG_TYPES.map((type) => (
          <span key={type} className="inline-flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-[3px]"
              style={{ background: ORG_TYPE_COLORS[type] }}
            />
            {ORG_TYPE_LABELS[type]}
          </span>
        ))}
      </div>
    </div>
  );
}

function StanceLegendItems({ insufficient }: { insufficient: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: STANCE_TEAL }}
        />
        Support / co-stance · solid teal
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-6 border-t-2 border-dashed"
          style={{ borderColor: STANCE_VERMILLION }}
        />
        Oppose / opposed on issues · dashed vermillion
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: STANCE_GOLD }}
        />
        Endorse · gold
      </span>
      {insufficient && (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-[3px]"
            style={{ background: STANCE_INSUFFICIENT }}
          />
          Insufficient overlap
        </span>
      )}
    </div>
  );
}
