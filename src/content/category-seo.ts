// ============================================================================
// Per-category SEO content for /product?category=...
// ============================================================================
// Each entry overrides the auto-generated title/description and adds:
//   - a collapsed "About these knives" disclosure ABOVE the product grid
//     (full intro hidden by default to keep products front-and-centre, but
//     still indexed by Google because <details> content is crawled normally)
//   - an SEO body paragraph BELOW the product grid (visible, below the fold)
//   - a FAQ section (also rendered as FAQPage JSON-LD for rich results)
//
// Keep `title` <= 60 chars, `description` <= 160 chars (Google snippet limits).
// ============================================================================

export type CategoryFaq = { question: string; answer: string };

export type CategorySeo = {
  title: string;
  description: string;
  h1?: string; // override default "{Catname} Knives" if needed
  disclosureLabel: string; // collapsed label, e.g. "About Gyuto knives"
  intro: string; // hidden by default behind the disclosure (~80-120 words)
  seoBody: string; // visible below the product grid (~150-200 words)
  faqs: CategoryFaq[];
};

export const CATEGORY_SEO: Record<string, CategorySeo> = {
  // --------------------------------------------------------------------------
  gyuto: {
    title: "Gyuto Knives — Japanese Chef's Knives | Shimeru Knives",
    description:
      "Hand-forged Gyuto knives — the Japanese chef's knife. Damascus and high-carbon steel blades from Shimeru. Free US shipping.",
    h1: "Gyuto Knives",
    disclosureLabel: "About Gyuto knives",
    intro:
      "The Gyuto is the Japanese answer to the Western chef's knife — lighter in the hand, harder at the edge, and balanced for long sessions of slicing, dicing, and rocking through prep. Literally \"cow sword,\" the Gyuto is the all-purpose workhorse of any Japanese kitchen, ground for clean push-cuts and ideal for protein, vegetables, and herbs alike. Our Gyutos are forged from high-carbon Damascus and VG10 cores, hardened to 60+ HRC for an edge that holds. Blade lengths from 180 mm to 240 mm. Every Gyuto ships sharp out of the box and is backed by our lifetime sharpening service.",
    seoBody:
      "Where a German chef's knife is heavy and beveled for crushing motion, a Gyuto is thin-bladed and ground for clean push-cuts — ideal for protein, vegetables, and herbs alike. Our Gyutos are forged from high-carbon Damascus and VG10 cores, hardened to 60+ HRC for an edge that holds far longer than a typical Western chef's knife. Choose 180 mm if your board is small or you want maximum control, 210 mm as the most popular all-rounder, or 240 mm if you regularly break down full proteins or cook for crowds. Pair with a Nakiri for vegetables or a Petty for finer work, or step up to a Kiritsuke if you want a single knife that does it all. Free US shipping on every order.",
    faqs: [
      {
        question: "What is a Gyuto knife used for?",
        answer:
          "A Gyuto is a multi-purpose Japanese chef's knife. It handles meat, fish, vegetables, and herbs — essentially anything a Western chef's knife can do, but with a thinner, sharper edge that prefers a push-cut motion over a heavy rock-chop.",
      },
      {
        question: "Gyuto vs chef knife — what's the difference?",
        answer:
          "A Gyuto is lighter, thinner, and harder than a typical Western chef's knife. Western blades sit around 56 HRC and are forgiving but require frequent honing; a Gyuto sits at 60+ HRC, holds its edge much longer, but should be used with cleaner cutting motion (no twisting on the board).",
      },
      {
        question: "What length Gyuto should I buy?",
        answer:
          "210 mm is the most popular all-rounder for home cooks. Choose 180 mm if your board is small or you want maximum control, 240 mm if you regularly break down full proteins or cook for crowds.",
      },
      {
        question: "Are Damascus Gyuto knives just for show?",
        answer:
          "No — the visible Damascus pattern is the layered cladding that protects a hard cutting core (typically VG10 or AUS-10). The pattern is decorative, but the laminated construction genuinely improves toughness and corrosion resistance.",
      },
      {
        question: "How do I care for a Gyuto?",
        answer:
          "Hand-wash and dry immediately after use, never put it in the dishwasher, and avoid bones, frozen food, and glass cutting boards. Hone weekly with a ceramic rod and have it sharpened every 6–12 months depending on use.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  santoku: {
    title: "Santoku Knives — Japanese All-Purpose Blades | Shimeru Knives",
    description:
      "Hand-forged Santoku knives — the three-virtues blade for meat, fish, and vegetables. Damascus and VG10 steel from Shimeru.",
    h1: "Santoku Knives",
    disclosureLabel: "About Santoku knives",
    intro:
      "The Santoku is Japan's most popular home kitchen knife — a shorter, flatter blade built for the three virtues: slicing, dicing, and chopping. Less rock, more precision. \"Santoku\" translates as \"three virtues,\" referring to its skill across meat, fish, and vegetables. Compared to a Gyuto, the Santoku has a flatter edge profile and a sheep's-foot tip — better suited to the down-and-forward chopping motion most home cooks naturally use. Forged from Damascus-clad VG10 cores at 60+ HRC, our Santokus are sharp out of the box and built to keep that edge through years of daily prep.",
    seoBody:
      "The shorter length (typically 165–180 mm) makes the Santoku easy to control and easy to store, while the hollow-ground (Granton) edge on many of our models stops slices of potato and zucchini sticking to the blade. If you cook mostly plant-forward food and want one knife to reach for, the Santoku is hard to beat. Choose 180 mm for a standard all-rounder or 165 mm for smaller hands and tighter prep areas. Every Santoku ships sharp from our workshop and is backed by our lifetime sharpening service.",
    faqs: [
      {
        question: "Santoku vs Gyuto — which is better for me?",
        answer:
          "If you naturally rock-chop and break down whole proteins, choose a Gyuto (210 mm). If you push-cut, prep mostly vegetables, or want a shorter, more controllable blade, choose a Santoku (180 mm). Both are excellent all-rounders.",
      },
      {
        question: "What does Santoku mean?",
        answer:
          "\"Santoku\" means \"three virtues\" or \"three uses\" in Japanese — referring to its ability to handle meat, fish, and vegetables equally well.",
      },
      {
        question: "Why does the Santoku have dimples?",
        answer:
          "The hollow-ground dimples (called Granton edge or kullenschliff) create air pockets that release suction, so wet or starchy foods like potato slices don't stick to the blade.",
      },
      {
        question: "Is a Santoku good for cutting meat?",
        answer:
          "Yes — for boneless cuts. The Santoku slices steak, chicken breast, and fish cleanly. For full proteins with bone, use a cleaver or a longer Gyuto.",
      },
      {
        question: "What size Santoku should I buy?",
        answer:
          "180 mm is the standard for home use and works for almost everyone. Choose 165 mm if you have smaller hands or a compact prep area.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  kiritsuke: {
    title: "Kiritsuke Knives — Hybrid Japanese Chef's Knife | Shimeru",
    description:
      "Hand-forged Kiritsuke knives combining the reach of a Gyuto with the precision of a Yanagiba. The chef's status blade, in Damascus steel.",
    h1: "Kiritsuke Knives",
    disclosureLabel: "About Kiritsuke knives",
    intro:
      "The Kiritsuke is the chef's status knife in Japan — a long, flat-profile hybrid that combines the slicing reach of a Yanagiba with the all-purpose versatility of a Gyuto. One blade, the entire prep board. Traditionally reserved for the head chef in a Japanese kitchen, the modern double-bevel Kiritsuke (Kiritsuke-Gyuto) is far more accessible than the traditional single-bevel original, making it an ideal one-knife solution for confident home cooks who want the reach for proteins and the flat edge for vegetable prep.",
    seoBody:
      "Ours are forged from layered Damascus over a VG10 core at 60+ HRC, with the distinctive angled k-tip that gives the Kiritsuke instant visual recognition. Blade lengths run 210–240 mm; the longer length rewards a longer board and a clean push-cut technique. If you're stepping up from a single chef's knife and want something with real presence in the hand, the Kiritsuke is the upgrade. Free US shipping, lifetime sharpening included.",
    faqs: [
      {
        question: "What is a Kiritsuke knife used for?",
        answer:
          "A Kiritsuke handles everything a chef's knife does — proteins, vegetables, fish, herbs — but with extra reach for long slicing strokes. It's prized for the precision of its flat profile and the reach of its length.",
      },
      {
        question: "Kiritsuke vs Gyuto — what's the difference?",
        answer:
          "A Gyuto has a curved belly that supports rock-chopping; a Kiritsuke has a flatter profile and the distinctive k-tip, optimized for push-cuts and long slicing strokes. The Kiritsuke also tends to be longer (210–240 mm vs 180–210 mm for Gyuto).",
      },
      {
        question: "Why is the Kiritsuke considered a status knife?",
        answer:
          "In traditional Japanese kitchens, the Kiritsuke was reserved for the executive chef as a sign of seniority. The single-bevel original takes years to master, so carrying one signaled skill and rank.",
      },
      {
        question: "Is a Kiritsuke a beginner knife?",
        answer:
          "The double-bevel modern Kiritsuke (Kiritsuke-Gyuto) is approachable for any cook comfortable with a chef's knife. The traditional single-bevel version is harder to use and we don't recommend it as a first Japanese knife.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  cleaver: {
    title: "Japanese Meat Cleavers & Chinese Cleavers | Shimeru Knives",
    description:
      "Hand-forged Japanese and Chinese cleavers — for breaking down proteins, chopping bones, and serious vegetable prep. Damascus and high-carbon steel.",
    h1: "Cleavers",
    disclosureLabel: "About our cleavers",
    intro:
      "Heavy enough to power through bone, sharp enough for paper-thin slices — our cleavers cover both styles: the broad-bladed Chinese cleaver (cai dao or chukabocho) for vegetable work and lighter prep, and the dedicated Japanese meat cleaver for serious butchery. The Chinese cleaver looks like a small axe but is actually thin-bladed and shockingly versatile — it's the all-purpose knife for most of China and South-East Asia. The Japanese meat cleaver, by contrast, is heavier-spined and ground specifically for breaking down full chickens, splitting joints, and working through soft bone.",
    seoBody:
      "Both styles are forged from Damascus and high-carbon steel in our workshop, and both shine for cooks who do real prep — bone-in proteins, full bunches of greens, whole roasts. If you're outgrowing your chef's knife on big jobs, this is your next blade. Choose a Chinese cleaver if you want a do-everything daily blade for slicing, dicing, mincing, and crushing garlic with the broad face. Choose a meat cleaver if you regularly butcher whole birds or split joints. Free US shipping on all cleavers.",
    faqs: [
      {
        question: "What's the difference between a Chinese cleaver and a meat cleaver?",
        answer:
          "A Chinese cleaver (cai dao) is thin-bladed and used for everyday slicing, dicing, and vegetable prep — it's not for bones. A Western or Japanese meat cleaver is much heavier, with a thick spine designed to chop through bone and break down whole proteins.",
      },
      {
        question: "Can I use a Chinese cleaver for everything?",
        answer:
          "For most everyday prep, yes — slicing, dicing, mincing, even crushing garlic with the side of the blade. Don't use it on hard bone or frozen food; the thin edge will chip.",
      },
      {
        question: "Is a meat cleaver good for cutting meat?",
        answer:
          "Yes — it's purpose-built for it. The weight and thickness let you split joints and break down bone-in proteins that would damage a chef's knife. For boneless slicing, a Gyuto or Sujihiki is faster.",
      },
      {
        question: "How do I sharpen a cleaver?",
        answer:
          "Same as any Japanese knife — use a whetstone (1000/3000 grit combo for maintenance) and follow the existing bevel angle. Heavier cleavers benefit from a slightly steeper angle (20°) to protect the edge during chopping.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  nakiri: {
    title: "Nakiri Knives — Japanese Vegetable Knives | Shimeru Knives",
    description:
      "Hand-forged Nakiri knives for serious vegetable prep. Flat-edged Damascus blades that breeze through onions, herbs, and root vegetables.",
    h1: "Nakiri Knives",
    disclosureLabel: "About Nakiri knives",
    intro:
      "The Nakiri is built for one thing and built for it perfectly — vegetables. The flat, rectangular blade lets the full edge meet the board on every stroke, so onions fall apart, herbs don't bruise, and squash gives in. If you cook plant-forward food, the Nakiri changes how prep feels. Where a chef's knife rocks against the board (and inevitably leaves the last sliver of onion attached), the Nakiri's flat edge cuts cleanly to the board on every push-down stroke — no rocking, no half-cuts.",
    seoBody:
      "The tall blade gives you knuckle clearance and doubles as a scoop for moving prep into the pan. Ours are forged from Damascus-clad VG10 at 60+ HRC, ground thin behind the edge for the kind of effortless slicing that makes vegetable prep a pleasure rather than a chore. Pair with a Gyuto or Santoku for proteins, and you've got the two-knife setup most professional Japanese kitchens actually use. Free US shipping, lifetime sharpening included.",
    faqs: [
      {
        question: "What is a Nakiri knife used for?",
        answer:
          "A Nakiri is a dedicated vegetable knife. The flat blade makes clean push-cuts through onions, cabbage, herbs, and root vegetables in a single motion. It's not for meat or bone.",
      },
      {
        question: "Nakiri vs Santoku — which should I get?",
        answer:
          "A Santoku is a multi-purpose blade (meat, fish, vegetables); a Nakiri is vegetable-only. If you cook lots of plants and already own a chef's knife or Gyuto, get the Nakiri. If you want one knife to do everything, get the Santoku.",
      },
      {
        question: "Can I use a Nakiri for meat?",
        answer:
          "It will cut boneless meat, but it's not optimal — the flat edge and lack of tip make tasks like boning chicken thighs awkward. Stick to vegetables and use a Gyuto or Santoku for proteins.",
      },
      {
        question: "Why is the Nakiri blade so tall?",
        answer:
          "Two reasons: knuckle clearance (your fingers stay well above the board) and a built-in bench scraper — the broad face is perfect for sweeping prepped vegetables into a pan or bowl.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  "knife-sets": {
    title: "Japanese Knife Sets — Damascus Chef's Knife Collections | Shimeru",
    description:
      "Curated Japanese knife sets — Damascus chef's knife, Santoku, Nakiri, and more. Save vs buying individually. Free US shipping.",
    h1: "Japanese Knife Sets",
    disclosureLabel: "About our knife sets",
    intro:
      "A complete kitchen, in one box. Our Japanese knife sets bundle the blades that actually work together — chef's knife plus dedicated vegetable, slicing, and utility knives — with savings vs buying them individually. A good knife set isn't about owning the most knives; it's about owning the right combination. Our sets are built around the working core of a Japanese kitchen: a Gyuto or Santoku as the everyday workhorse, a Nakiri for vegetables, a Petty for finer work, and a slicer or bread knife for jobs the chef's knife can't do well.",
    seoBody:
      "Every blade in every set is forged from Damascus-clad VG10 or AUS-10 at 60+ HRC — the same steel and finish you'd get buying them one at a time. Sets ship in a presentation gift box, making them a strong gift for serious home cooks, new homeowners, or anyone graduating from a beginner block set to real Japanese steel. Free US shipping, and every set is backed by our lifetime sharpening service.",
    faqs: [
      {
        question: "What knives should be in a starter set?",
        answer:
          "At minimum: a chef's knife (Gyuto or Santoku) for everyday prep, a paring or Petty knife for finer work, and a serrated bread knife. Add a Nakiri if you cook a lot of vegetables.",
      },
      {
        question: "Are knife sets worth it vs buying individually?",
        answer:
          "If you'd buy 3+ knives anyway, yes — our sets are priced lower than the individual knives combined, and the matched handles look cohesive in a block or on a magnetic strip.",
      },
      {
        question: "Do your knife sets come with a block?",
        answer:
          "Most sets ship in a presentation gift box rather than a counter block. We recommend storing knives on a magnetic strip or in an in-drawer holder — both protect the edge better than a slot block.",
      },
      {
        question: "Are these knife sets dishwasher safe?",
        answer:
          "No — Japanese hard steel should never go in a dishwasher. The heat, detergent, and contact with other utensils will damage the edge and the handle. Hand-wash and dry immediately.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  "japanese-breadknife": {
    title: "Japanese Bread Knives — Damascus Serrated Blades | Shimeru",
    description:
      "Hand-forged Japanese bread knives in Damascus steel. Sharp, long-lasting serrations for sourdough, baguettes, and tomatoes.",
    h1: "Japanese Bread Knives",
    disclosureLabel: "About our bread knives",
    intro:
      "A great bread knife is the difference between clean slices through a crusty sourdough and a flattened, torn loaf. Ours are Damascus-clad with deep, hand-honed serrations — the kind of edge that lasts. Most supermarket bread knives are stamped, not forged — they cut adequately for a year, then go dull and become impossible to sharpen. A Japanese Damascus bread knife is a different category entirely: hand-forged with deep, individually-ground serrations on a high-carbon steel core, built to slice through hard crusts without tearing the crumb beneath.",
    seoBody:
      "Use yours on sourdough, baguettes, brioche, and bagels — but also on tomatoes, peaches, and other soft-skinned produce that tends to crush under a regular chef's knife. The long blade (240 mm typical) lets you work through a full loaf in a single stroke, and the Damascus cladding adds visible craft to a tool that's normally an afterthought. Our serrations are sharpened by hand and can be re-honed by our specialist service when needed.",
    faqs: [
      {
        question: "Can a Japanese bread knife be sharpened?",
        answer:
          "Yes, but it's a specialist job — each serration has to be sharpened individually with a tapered ceramic rod or a serration sharpener. We offer this as part of our sharpening service.",
      },
      {
        question: "What can I cut with a bread knife other than bread?",
        answer:
          "Anything with a hard or slippery exterior and soft interior: tomatoes, peaches, pineapple, watermelon rind, cake layers, and roast beef.",
      },
      {
        question: "Do I need a Japanese bread knife if I have a chef's knife?",
        answer:
          "Yes — a chef's knife crushes bread crust rather than cutting through it cleanly, and the rocking motion that works on vegetables tears soft crumb. A serrated bread knife is the only tool for the job.",
      },
      {
        question: "How long should a bread knife be?",
        answer:
          "240 mm (9.5 inches) is ideal for full sourdough boules and country loaves. 200 mm works fine for sliced bread and baguettes if counter space is tight.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  sharpener: {
    title: "Knife Sharpeners & Whetstones | Shimeru Knives",
    description:
      "Whetstones, honing rods, and knife sharpeners for keeping your Japanese knives at their best. Maintenance gear from Shimeru.",
    h1: "Knife Sharpeners",
    disclosureLabel: "About knife sharpening",
    intro:
      "Even the hardest steel dulls eventually. Keep your Japanese knives at their original edge with whetstones, honing rods, and the maintenance gear we use ourselves. A Japanese knife at 60+ HRC will hold its edge for months of regular use, but it will eventually need honing and, less often, sharpening. We stock the maintenance gear we recommend to our own customers: combination whetstones (1000/3000 grit covers most needs), finishing stones for a polished edge, and ceramic honing rods for between-sharpenings touch-ups.",
    seoBody:
      "Avoid pull-through sharpeners on Japanese steel — the fixed angle is wrong for most Japanese blades and the abrasive aggressively removes metal you don't need to lose. If you'd rather not sharpen yourself, our lifetime sharpening service is included with every knife purchase.",
    faqs: [
      {
        question: "How often should I sharpen a Japanese knife?",
        answer:
          "For home use, once every 6–12 months on a whetstone is plenty. Hone weekly with a ceramic rod between sharpenings to realign the edge.",
      },
      {
        question: "Can I use a pull-through sharpener?",
        answer:
          "We don't recommend it. Pull-through sharpeners use a fixed angle (usually 20°) that's wrong for most Japanese knives (15–17°), and they remove far more steel than necessary, shortening your knife's life.",
      },
      {
        question: "What grit whetstone should I buy?",
        answer:
          "A 1000/3000 combo stone covers 90% of home use. The 1000 side handles routine sharpening; the 3000 side polishes the edge to a finer finish. Add a 6000+ finishing stone if you want a mirror polish.",
      },
    ],
  },

  // --------------------------------------------------------------------------
  "steak-knives": {
    title: "Japanese Steak Knives — Damascus Table Knives | Shimeru",
    description:
      "Hand-forged Japanese steak knives in Damascus steel. Sharp, beautiful, and built to last — the steak knife your dinner deserves.",
    h1: "Japanese Steak Knives",
    disclosureLabel: "About our steak knives",
    intro:
      "A great steak deserves a great knife. Our Damascus steak knives bring the same hand-forged steel and visible craft as our chef's knives — sharp enough to glide through a ribeye, beautiful enough for the table. Most steak knives are an afterthought — serrated, stamped, designed to be cheap rather than to cut well. A proper non-serrated steak knife in hard Japanese steel cuts cleanly through any steak without tearing the fibers, and never needs to be replaced because the serrations have gone dull.",
    seoBody:
      "Our steak knives are forged from Damascus-clad VG10, hardened to 60+ HRC, and finished with the same care as our chef's knives. They look at home on a dinner-party table and they'll outlast any disposable set you've replaced over the years.",
    faqs: [
      {
        question: "Are non-serrated steak knives better?",
        answer:
          "For tender steaks, yes — a sharp straight edge slices cleanly without sawing or tearing. Serrated steak knives are forgiving when dull but they crush and tear the meat fibers rather than cutting them.",
      },
      {
        question: "Can I put steak knives in the dishwasher?",
        answer:
          "No — high-carbon Japanese steel will rust and the edge will dull quickly from contact with other cutlery. Hand-wash, dry immediately, and store on a magnetic strip or in their box.",
      },
    ],
  },
};

// --------------------------------------------------------------------------
// Default for /product (no category)
// --------------------------------------------------------------------------
export const ALL_PRODUCTS_SEO: CategorySeo = {
  title: "Japanese Kitchen Knives — Hand-Forged Damascus Blades | Shimeru",
  description:
    "Hand-forged Japanese kitchen knives — Gyuto, Santoku, Nakiri, Kiritsuke, and more. Damascus steel at 60+ HRC. Free US shipping.",
  h1: "All Knives",
  disclosureLabel: "About our knives",
  intro:
    "Hand-forged Japanese kitchen knives — every blade in our collection is made from layered Damascus over a VG10 or AUS-10 core, hardened to 60+ HRC, and finished by hand. Our full collection covers the everyday Gyuto and Santoku through specialist blades like the Nakiri (vegetables), Kiritsuke (chef's hybrid), and Japanese-style bread knife.",
  seoBody:
    "Every knife is forged from Damascus-clad high-carbon steel at 60+ HRC, the same hardness used by professional Japanese kitchens — meaning a sharper edge that holds up over years of daily use. Not sure where to start? Take our 60-second knife guide and we'll match you with the right blade for how you cook. Free US shipping on every order, and every knife is backed by our lifetime sharpening service.",
  faqs: [
    {
      question: "What makes Japanese knives different from Western knives?",
      answer:
        "Japanese knives are typically thinner, harder (60+ HRC vs ~56 HRC for German knives), and ground at a steeper angle (15–17° vs 20°). The result is a sharper, longer-lasting edge that prefers a clean push-cut over a heavy rock-chop motion.",
    },
    {
      question: "What knife should I buy first?",
      answer:
        "A 210 mm Gyuto or 180 mm Santoku covers 80%+ of everyday prep. Add a paring knife for finer work and a serrated bread knife, and you have a working three-knife kitchen.",
    },
    {
      question: "How do I look after a Japanese knife?",
      answer:
        "Hand-wash and dry immediately, never put it in the dishwasher, avoid bones and frozen food, and use a wood or composite cutting board (never glass or marble). Hone weekly with a ceramic rod and sharpen on a whetstone every 6–12 months.",
    },
    {
      question: "Do you ship to the US?",
      answer:
        "Yes — free shipping on all US orders. Most orders arrive within 5–7 business days.",
    },
  ],
};
