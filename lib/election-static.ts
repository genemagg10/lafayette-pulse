/**
 * Voter-guide copy that is not a row in measures, stances, candidacies,
 * events, or contributions. Cal-Access figures are committee-period totals
 * from the October 15 guide. They are not contributions rows and must not
 * be added across propositions.
 */

export interface CalAccessCommittee {
  name: string;
  href: string;
  raised: string | null;
}

export const CAL_ACCESS_AS_OF =
  "Calendar-2026 committee totals through September 19, 2026, copied from the October 15 voter guide (Cal-Access). These are not rows in the contributions table.";

export const CAL_ACCESS_WARNING =
  "A committee working on several propositions shows its full total under each one. Do not add amounts across propositions.";

const ca = (id: string) =>
  `https://cal-access.sos.ca.gov/Campaign/Committees/Detail.aspx?id=${id}&session=2025`;

export const CAL_ACCESS: Record<
  string,
  { support: CalAccessCommittee[]; oppose: CalAccessCommittee[] }
> = {
  "Prop 1": {
    support: [
      { name: "Yes On Prop 1 Californians For Homes, Jobs And Affordability 2026, Sponsored By Affordable Housing Organizations", href: ca("1485601"), raised: "$7,408,905" },
      { name: "Californians For Affordable Homes, Yes On Proposition 1, Sponsored By Nph Action Fund", href: ca("1492745"), raised: "$1,080,158" },
      { name: "Yes On Prop 1, California Homeless And Housing Coalition Action Fund", href: ca("1493876"), raised: "$290,000" },
    ],
    oppose: [],
  },
  "Prop 2": { support: [], oppose: [] },
  "Prop 3": {
    support: [
      { name: "Yes On Prop 3, Sponsored By Education And Labor Organizations", href: ca("1483562"), raised: "$38,034,890" },
      { name: "Tax The Ultra-Rich Now, Yes On 3 & 40, No On 41 & 42", href: ca("1495036"), raised: "$340,225" },
      { name: "Communities For An Affordable California, Yes On 3, No On 39 And 43 Sponsored By Million Voters Project Action Fund", href: ca("1496598"), raised: "$200,000" },
      { name: "Working Families For A Better Central Coast- Yes On Prop 3, No On Prop 39, Sponsored By Unidos 805 Action Fund", href: ca("1496613"), raised: null },
      { name: "Working People In Supporting Of Prop 3 And In Opposition Of Prop 39, 43 And 45, Sponsored By Los Angeles County Federation Of Labor Afl-Cio", href: ca("1497629"), raised: null },
    ],
    oppose: [
      { name: "No On Proposition 3, Sponsored By California Taxpayers Association", href: ca("1492860"), raised: "$5,500" },
    ],
  },
  "Prop 4": {
    support: [
      { name: "Movement Voter Pac (Fec Pac Id C00728360) Supporting Prop 4", href: ca("1497099"), raised: "$235,157" },
    ],
    oppose: [],
  },
  "Prop 5": { support: [], oppose: [] },
  "Prop 37": {
    support: [
      { name: "Homeownership For Families, Sponsored By California Association Of Realtors - Yes On 37", href: ca("1400190"), raised: "$26,000,000" },
      { name: "Yes On 37, California Homeownership", href: ca("1481256"), raised: "$17,981,305" },
    ],
    oppose: [],
  },
  "Prop 38": {
    support: [
      { name: "Yes On 38: Californians For Life-Saving Immunology Research And Cures, Sponsored By The Michelson Center For Public Policy", href: ca("1485847"), raised: "$38,201,946" },
      { name: "Michelson Center For Public Policy, Inc. - Yes On 38 (Nonprofit 501 (C)(4))", href: ca("1494727"), raised: "$13,000,000" },
    ],
    oppose: [{ name: "No On Proposition 38", href: ca("1495405"), raised: "$640" }],
  },
  "Prop 39": {
    support: [
      { name: "Californians For Voter Id, Yes On 39", href: ca("1479607"), raised: "$15,735,437" },
    ],
    oppose: [
      { name: "No On 39 - Block Election Rigging Sponsored By Nurses, Teachers, And Nonprofit Labor And Community Health Clinic Organziations", href: ca("1493991"), raised: "$11,642,054" },
      { name: "No On Prop 39 - Californians For Voting Rights, Sponsored By California Donor Table & Aclu Of Northern California", href: ca("1489007"), raised: "$3,925,220" },
      { name: "United Against Prop. 39 - - Stop The Rig Sponsored By Nonprofit Labor And Civil Rights Organizations", href: ca("1495206"), raised: "$2,001,189" },
      { name: "Communities For An Affordable California, Yes On 3, No On 39 And 43 Sponsored By Million Voters Project Action Fund", href: ca("1496598"), raised: "$200,000" },
      { name: "Working Families For A Better Central Coast- Yes On Prop 3, No On Prop 39, Sponsored By Unidos 805 Action Fund", href: ca("1496613"), raised: null },
      { name: "No On Prop 39 - Voteriders Committee", href: ca("1484827"), raised: null },
      { name: "Working People In Supporting Of Prop 3 And In Opposition Of Prop 39, 43 And 45, Sponsored By Los Angeles County Federation Of Labor Afl-Cio", href: ca("1497629"), raised: null },
    ],
  },
  "Prop 40": {
    support: [
      { name: "Yes On 40 - Billionaire Tax Now - No On 41 & 42, Sponsored By Service Employees International Union - United Healthcare Workers West", href: ca("1484470"), raised: "$30,932,096" },
      { name: "Tax The Ultra-Rich Now, Yes On 3 & 40, No On 41 & 42", href: ca("1495036"), raised: "$340,225" },
    ],
    oppose: [
      { name: "No On Prop 40 - Doctors, Teachers, Small Businesses, Working Families And Public Safety Against The Reckless Wealth Tax Experiment", href: ca("1492108"), raised: "$56,721,279" },
      { name: "Golden State Promise - No On Prop 40", href: ca("1486695"), raised: "$10,450,000" },
      { name: "Stop The Squeeze - No On Prop 40", href: ca("1485007"), raised: "$300,000" },
      { name: "Californians Against Tax Increases, Sponsored By The California Business Roundtable - No On 40", href: ca("1485228"), raised: "$95,000" },
    ],
  },
  "Prop 41": {
    support: [
      { name: "Yes On 41 - Californians For Transparency And Accountability, A Coaltion Of Small Businessess, Taxpayers, Good Government Advocates, Accountants And Auditing Experts", href: ca("1488423"), raised: "$58,376,446" },
    ],
    oppose: [
      { name: "Tax The Ultra-Rich Now, Yes On 3 & 40, No On 41 & 42", href: ca("1495036"), raised: "$340,225" },
      { name: "Working Families Say No To Propositions 41 And 42 Sponsored By Labor Unions", href: ca("1497412"), raised: null },
    ],
  },
  "Prop 42": {
    support: [
      { name: "Yes On 42 - Protect Retirement & Life Savings, A Coalition Of Retirees, Blue-Collar Workers, Seniors, Veterans, Small Businesses & Taxpayers", href: ca("1488418"), raised: "$60,827,037" },
    ],
    oppose: [
      { name: "Tax The Ultra-Rich Now, Yes On 3 & 40, No On 41 & 42", href: ca("1495036"), raised: "$340,225" },
      { name: "Working Families Say No To Propositions 41 And 42 Sponsored By Labor Unions", href: ca("1497412"), raised: null },
    ],
  },
  "Prop 43": {
    support: [
      { name: "Yes On Prop 43 - The Local Taxpayer Protection Act, Sponsored By Homeowners, Businesses, And Taxpayers", href: ca("1484860"), raised: "$9,264,143" },
      { name: "Yes On Prop. 43, A Project Of The Howard Jarvis Taxpayers Association", href: ca("1493012"), raised: "$704,867" },
    ],
    oppose: [
      { name: "No On Prop 43: Stop The Local Taxpayer Deception Act, Sponsored By Labor Organizations", href: ca("1492508"), raised: "$4,164,393" },
      { name: "Communities For An Affordable California, Yes On 3, No On 39 And 43 Sponsored By Million Voters Project Action Fund", href: ca("1496598"), raised: "$200,000" },
      { name: "Working People In Supporting Of Prop 3 And In Opposition Of Prop 39, 43 And 45, Sponsored By Los Angeles County Federation Of Labor Afl-Cio", href: ca("1497629"), raised: null },
    ],
  },
  "Prop 44": {
    support: [
      { name: "Yes On Prop 44, Sponsored By Service Employees International Union - United Healthcare Workers West", href: ca("1483073"), raised: "$10,781,565" },
    ],
    oppose: [
      { name: "No On Prop 44 - Stop The Attack On Patients And Community Health Clinics, Sponsored By California Primary Care Association Adovcates", href: ca("1484266"), raised: "$21,543,482" },
    ],
  },
  "Prop 45": {
    support: [
      { name: "Yes On 45 - Building A More Affordable California, A Coalition Of Water, Affordable Housing, Clean Energy, Small Business, Healthcare & Community Leaders", href: ca("1484853"), raised: "$27,617,856" },
      { name: "California Building Industry Association Issues Committee Supporting Proposition 45", href: ca("1353866"), raised: "$7,526,847" },
      { name: "Building Industry Association Of Southern California Issues Pac - Yes On 45", href: ca("1442568"), raised: "$930,100" },
    ],
    oppose: [
      { name: "No On Prop 45, Sponsored By Labor, Health And Environmental Organizations", href: ca("1492264"), raised: "$14,590,555" },
      { name: "No On Prop 45 - Protect California Communities", href: ca("1479255"), raised: "$3,370,241" },
      { name: "Campaign For People Over Polluters, No On Prop. 45, Sponsored By Environmental & Healthcare Organizations", href: ca("1493079"), raised: "$485,593" },
      { name: "Working People In Supporting Of Prop 3 And In Opposition Of Prop 39, 43 And 45, Sponsored By Los Angeles County Federation Of Labor Afl-Cio", href: ca("1497629"), raised: null },
    ],
  },
};

export const LOCAL_CHOICE: Record<string, { yes: string; no: string }> = {
  W: {
    yes: "Authorize the $168 parcel tax for 8 years.",
    no: "Reject it.",
  },
  RTM: {
    yes: "Add the 0.5% sales tax in Contra Costa for 14 years.",
    no: "Do not add it.",
  },
};

export const MEASURE_GUIDE_NOTES: Record<string, { text: string; href?: string; label?: string }[]> = {
  W: [
    {
      text: "The Yes on W site lists Lafayette City Council among its endorsers. That name was not stored as a stance, because it did not match an organization record exactly. Endorsements below are the stance rows.",
      href: "https://www.yesforourhighschools.com/endorsements",
      label: "Yes on W endorsements",
    },
    {
      text: "The opposition campaign is at StopMeasureW.com. Local committees file on NetFile. The Yes on W committee is FPPC #1478885. Itemized 497 lines are in Donations.",
    },
  ],
  RTM: [
    {
      text: "There is no state Cal-Access committee for RTM. Its filings are with the county on NetFile. The Yes on RTM site lists Contra Costa supervisors and BART directors among others.",
      href: "https://www.regionaltransitmeasure.com/endorsements",
      label: "Yes on RTM endorsements",
    },
  ],
};

export interface DistrictFact {
  title: string;
  text: string;
  links: { href: string; label: string }[];
}

export const DISTRICT_FACTS: DistrictFact[] = [
  {
    title: "Acalanes Union High School District (AUHSD)",
    text: "Based on the district's official trustee-area GIS overlaid on the county city-limits layer, Lafayette falls in Area 3 (about 42%), Area 4 (about 51%), and Area 5 (about 7%). None of Lafayette is in Area 1. Area 4 votes in 2028. Overlap percentages are not in a database table yet; this note is from the October 15 guide.",
    links: [
      {
        href: "https://western-schools.maps.arcgis.com/apps/instant/lookup/index.html?appid=3314782caa3848f9ada735fcf8406fa4",
        label: "AUHSD Trustee Area Locator",
      },
    ],
  },
  {
    title: "Central San",
    text: "About 98% of Lafayette is in Division 2, according to Central San GIS.",
    links: [
      {
        href: "https://services2.arcgis.com/xfDcx027RIgNdXSo/arcgis/rest/services/Director_Division/FeatureServer/0",
        label: "Central San GIS",
      },
    ],
  },
  {
    title: "County Board of Education",
    text: "Area 2 includes Lafayette.",
    links: [],
  },
  {
    title: "EBMUD Ward 2",
    text: "Luz Gómez was appointed in lieu of election on August 18, so this race is not on the ballot. She is listed with the other off-ballot rows, not as a winner.",
    links: [],
  },
];

export const WATCH_NOTES: { title: string; text: string; href: string; label: string }[] = [
  {
    title: "Where the roundtables air",
    text: "LWVDV/CCTV candidate roundtables are pre-recorded and air through the election on Comcast 27, AT&T U-Verse 99, and Astound 32/1027, and on the CCTV and LWVDV YouTube channels.",
    href: "https://my.lwv.org/california/diablo-valley/event/candidate-forums-and-roundtables-2026-various-dateslocations",
    label: "LWVDV",
  },
  {
    title: "Governor debate",
    text: "The only scheduled Becerra–Hilton debate was September 30 on CNN. The recording is on the Internet Archive.",
    href: "https://archive.org/details/CNNW_20261001_010000_California_Governor_Debate_A_CNN_Special_Event",
    label: "Internet Archive",
  },
  {
    title: "Proposition talks",
    text: "LWVDV Pros & Cons recordings are on the LWVDV page. The Lafayette sessions (Temple Isaiah on October 6 and Lafayette Library on October 8) have already happened. As of October 15, no further in-person LWVDV forums were scheduled for Lafayette before November 3.",
    href: "https://my.lwv.org/california/diablo-valley/event/2026-california-ballot-measures-pros-and-cons-various-dateslocations",
    label: "LWVDV Pros & Cons",
  },
];

export const CANDIDATE_SOURCE_NOTE =
  "Endorsements below are stance rows (support, oppose, endorse, neutral). The League of Women Voters does not endorse candidates. Party and newspaper endorsements are whoever filed a stance, not a recommendation from Lafayette Pulse.";
