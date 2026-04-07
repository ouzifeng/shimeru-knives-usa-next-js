"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================================
   Quiz Data — Questions, Options & Recommendation Logic
   ========================================================================= */

interface QuizOption {
  id: string;
  label: string;
  sublabel?: string;
  icon: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  subtitle: string;
  options: QuizOption[];
}

const QUESTIONS: QuizQuestion[] = [
  {
    id: "cook_what",
    question: "What do you cook most?",
    subtitle: "Think about a typical week in your kitchen",
    options: [
      { id: "vegetables", label: "Vegetables", sublabel: "Stir-fries, salads, soups", icon: "🥬" },
      { id: "meat", label: "Meat & Poultry", sublabel: "Steaks, roasts, chicken", icon: "🥩" },
      { id: "fish", label: "Fish & Seafood", sublabel: "Fillets, sashimi, shellfish", icon: "🐟" },
      { id: "everything", label: "A bit of everything", sublabel: "I cook all kinds of meals", icon: "🍳" },
    ],
  },
  {
    id: "experience",
    question: "How confident are you with knives?",
    subtitle: "There's no wrong answer — every level has a perfect match",
    options: [
      { id: "beginner", label: "Just starting out", sublabel: "I want something forgiving and easy", icon: "🌱" },
      { id: "confident", label: "Comfortable cook", sublabel: "I cook regularly and want to level up", icon: "👨‍🍳" },
      { id: "advanced", label: "Serious about my tools", sublabel: "I sharpen my own knives", icon: "⚔️" },
    ],
  },
  {
    id: "priority",
    question: "What matters most to you?",
    subtitle: "Pick the quality you value above all else",
    options: [
      { id: "versatility", label: "Versatility", sublabel: "One knife that does it all", icon: "🔄" },
      { id: "precision", label: "Precision", sublabel: "Clean, exact cuts every time", icon: "🎯" },
      { id: "ease", label: "Easy maintenance", sublabel: "Low effort, stays sharp", icon: "✨" },
      { id: "style", label: "Beautiful craftsmanship", sublabel: "A knife that feels special", icon: "💎" },
    ],
  },
  {
    id: "size",
    question: "What blade size feels right?",
    subtitle: "Hold your hand flat — imagine the blade against it",
    options: [
      { id: "compact", label: "Compact", sublabel: "Under 6\" — nimble and precise", icon: "🔹" },
      { id: "medium", label: "Medium", sublabel: "6–7\" — balanced all-rounder", icon: "🔶" },
      { id: "large", label: "Large", sublabel: "8\"+ — commanding reach", icon: "🔷" },
    ],
  },
];

/* ============================================================================
   Recommendation Engine
   ========================================================================= */

interface KnifeRecommendation {
  name: string;
  japanese: string;
  categorySlug: string;
  description: string;
  why: string;
  alsoConsider?: { name: string; slug: string; reason: string };
}

function getRecommendation(answers: Record<string, string>): KnifeRecommendation {
  const { cook_what, experience, priority, size } = answers;

  // Fish specialist
  if (cook_what === "fish" && experience === "advanced") {
    return {
      name: "Deba",
      japanese: "出刃包丁",
      categorySlug: "deba",
      description:
        "The traditional Japanese fish butchery knife. Its thick, heavy blade powers through fish bones and cartilage with single-bevel precision.",
      why: "Your experience with knives and focus on fish makes the Deba a natural choice — it's the knife Japanese fish markets rely on.",
      alsoConsider: { name: "Fillet Knife", slug: "fillet-knife", reason: "For delicate filleting work" },
    };
  }

  if (cook_what === "fish") {
    return {
      name: "Petty",
      japanese: "ペティナイフ",
      categorySlug: "petty",
      description:
        "A nimble Japanese utility knife perfect for trimming fish, removing pin bones, and detailed prep work. Approachable for any skill level.",
      why: "The Petty gives you precision for fish prep without the learning curve of traditional single-bevel knives.",
      alsoConsider: { name: "Fillet Knife", slug: "fillet-knife", reason: "For whole fish filleting" },
    };
  }

  // Vegetable specialist
  if (cook_what === "vegetables" && (size === "medium" || size === "large")) {
    return {
      name: "Nakiri",
      japanese: "菜切り包丁",
      categorySlug: "nakiri",
      description:
        "Japan's dedicated vegetable knife. The perfectly flat edge makes full contact with the cutting board for clean, effortless cuts through any produce.",
      why: "Nothing cuts vegetables like a Nakiri — the flat blade means every millimetre makes contact for perfect julienne, brunoise, and rough chops.",
      alsoConsider: { name: "Bunka", slug: "bunka", reason: "If you want a pointed tip for detail work too" },
    };
  }

  if (cook_what === "vegetables" && size === "compact") {
    return {
      name: "Petty",
      japanese: "ペティナイフ",
      categorySlug: "petty",
      description:
        "A compact Japanese utility knife ideal for peeling, trimming, and precise vegetable work. Light and agile in the hand.",
      why: "For compact vegetable prep — peeling, trimming, garnishing — the Petty is unmatched for its agility.",
      alsoConsider: { name: "Nakiri", slug: "nakiri", reason: "If you also want a board knife for larger veg" },
    };
  }

  // Meat specialist
  if (cook_what === "meat" && size === "large" && experience === "advanced") {
    return {
      name: "Kiritsuke",
      japanese: "切付包丁",
      categorySlug: "kiritsuke",
      description:
        "The executive chef's knife in Japan. A long, angular blade that handles everything from breaking down proteins to precise vegetable work with authority.",
      why: "Your skill level and preference for a larger blade makes the Kiritsuke ideal — it's traditionally reserved for head chefs.",
      alsoConsider: { name: "Gyuto", slug: "gyuto", reason: "A more versatile alternative with a curved belly" },
    };
  }

  if (cook_what === "meat" && size === "large") {
    return {
      name: "Gyuto",
      japanese: "牛刀",
      categorySlug: "gyuto",
      description:
        "The Japanese chef's knife — lighter and sharper than Western equivalents. Its curved belly excels at rocking through proteins while the pointed tip handles detail work.",
      why: "The Gyuto is the go-to for meat work. Its profile and weight make breaking down cuts feel effortless.",
      alsoConsider: { name: "Cleaver", slug: "cleaver", reason: "For heavy-duty butchery tasks" },
    };
  }

  if (cook_what === "meat") {
    return {
      name: "Santoku",
      japanese: "三徳包丁",
      categorySlug: "santoku",
      description:
        "The \"three virtues\" knife — equally skilled with meat, fish, and vegetables. A shorter, lighter alternative to the Gyuto that's comfortable for any hand size.",
      why: "The Santoku's flat profile makes it great for clean slicing of proteins, and its compact size gives you confidence and control.",
      alsoConsider: { name: "Gyuto", slug: "gyuto", reason: "If you'd prefer a longer, curved blade" },
    };
  }

  // Style/craftsmanship priority
  if (priority === "style" && experience === "advanced") {
    return {
      name: "Kiritsuke",
      japanese: "切付包丁",
      categorySlug: "kiritsuke",
      description:
        "The most prestigious knife in the Japanese kitchen. Its striking angular profile and long flat edge are as beautiful as they are functional.",
      why: "The Kiritsuke is the knife that draws eyes. Traditionally a mark of the head chef — it's craftsmanship you can feel in every cut.",
      alsoConsider: { name: "Bunka", slug: "bunka", reason: "For a similarly striking k-tip in a compact size" },
    };
  }

  if (priority === "style") {
    return {
      name: "Bunka",
      japanese: "文化包丁",
      categorySlug: "bunka",
      description:
        "A modern Japanese knife with a distinctive angular \"k-tip\" that's as striking as it is precise. Excellent for detail work and everyday cooking.",
      why: "The Bunka's reverse-tanto tip makes it one of the most visually distinctive knives in any kitchen — and it performs beautifully.",
      alsoConsider: { name: "Kiritsuke", slug: "kiritsuke", reason: "For a larger statement piece" },
    };
  }

  // Precision priority
  if (priority === "precision" && size === "compact") {
    return {
      name: "Petty",
      japanese: "ペティナイフ",
      categorySlug: "petty",
      description:
        "The Japanese precision instrument. A short, nimble blade for garnishes, peeling, trimming, and any task where control matters most.",
      why: "When precision is everything and you want a compact blade, the Petty is the surgeon's scalpel of the kitchen.",
      alsoConsider: { name: "Paring Knife", slug: "paring-knife", reason: "Even smaller for in-hand work" },
    };
  }

  if (priority === "precision") {
    return {
      name: "Bunka",
      japanese: "文化包丁",
      categorySlug: "bunka",
      description:
        "The angular k-tip gives you a fine point for intricate cuts, while the flat edge provides board contact for clean chopping. Precision built into the geometry.",
      why: "The Bunka's pointed tip geometry is designed for precision work — scoring, fine dicing, and detailed cuts come naturally.",
      alsoConsider: { name: "Kiritsuke", slug: "kiritsuke", reason: "For precision at a longer length" },
    };
  }

  // Easy maintenance priority
  if (priority === "ease") {
    return {
      name: "Santoku",
      japanese: "三徳包丁",
      categorySlug: "santoku",
      description:
        "Japan's most popular home kitchen knife. The Santoku is forgiving, versatile, and easy to maintain — it handles meat, fish, and vegetables with equal grace.",
      why: "The Santoku is designed for everyday ease. It stays sharp, it's comfortable, and it handles everything without fuss.",
      alsoConsider: { name: "Gyuto", slug: "gyuto", reason: "If you'd like a larger, curved alternative" },
    };
  }

  // Versatility + large
  if (priority === "versatility" && size === "large") {
    return {
      name: "Gyuto",
      japanese: "牛刀",
      categorySlug: "gyuto",
      description:
        "The ultimate all-purpose Japanese knife. Lighter and sharper than a Western chef's knife, with a curved belly for rocking and a fine tip for detail work.",
      why: "If you want one knife that handles everything with a commanding reach, the Gyuto is the definitive answer.",
      alsoConsider: { name: "Kiritsuke", slug: "kiritsuke", reason: "For a flatter, more angular alternative" },
    };
  }

  // Versatility + medium (or default)
  if (size === "medium" || priority === "versatility") {
    return {
      name: "Santoku",
      japanese: "三徳包丁",
      categorySlug: "santoku",
      description:
        "The \"three virtues\" knife — meat, fish, and vegetables. Compact, balanced, and comfortable. The most popular knife in Japanese home kitchens for good reason.",
      why: "For a versatile medium blade, nothing beats the Santoku. It's the one knife that genuinely does it all.",
      alsoConsider: { name: "Gyuto", slug: "gyuto", reason: "If you find yourself wanting more reach" },
    };
  }

  // Fallback — Gyuto as the universal recommendation
  return {
    name: "Gyuto",
    japanese: "牛刀",
    categorySlug: "gyuto",
    description:
      "The Japanese chef's knife — versatile, sharp, and balanced. An exceptional all-rounder for any kitchen and any skill level.",
    why: "The Gyuto is the single best knife to own. It handles every task with grace and will grow with your skills.",
    alsoConsider: { name: "Santoku", slug: "santoku", reason: "For a shorter, lighter alternative" },
  };
}

/* ============================================================================
   Quiz Components
   ========================================================================= */

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-0.5 flex-1 rounded-full transition-all duration-500",
            i < current ? "bg-primary" : i === current ? "bg-primary/40" : "bg-border"
          )}
        />
      ))}
    </div>
  );
}

function QuestionCard({
  question,
  onSelect,
  selectedId,
}: {
  question: QuizQuestion;
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-10 sm:mb-14">
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light tracking-tight leading-tight">
          {question.question}
        </h2>
        <p className="text-muted-foreground mt-3 text-sm sm:text-base">
          {question.subtitle}
        </p>
      </div>

      <div className="grid gap-3">
        {question.options.map((option, i) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={cn(
              "group relative flex items-center gap-4 sm:gap-5 rounded border p-4 sm:p-5 text-left transition-all duration-200",
              selectedId === option.id
                ? "border-primary bg-primary/[0.03] shadow-sm"
                : "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.02]"
            )}
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
          >
            <span className="text-2xl sm:text-3xl shrink-0 grayscale-[0.2]">{option.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base">{option.label}</p>
              {option.sublabel && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{option.sublabel}</p>
              )}
            </div>
            <div
              className={cn(
                "size-5 rounded-full border-2 shrink-0 transition-all duration-200 flex items-center justify-center",
                selectedId === option.id
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30 group-hover:border-primary/40"
              )}
            >
              {selectedId === option.id && (
                <div className="size-2 rounded-full bg-primary-foreground" />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ recommendation, onReset }: { recommendation: KnifeRecommendation; onReset: () => void }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      {/* Header */}
      <div className="text-center mb-10 sm:mb-14">
        <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground font-medium">
          Your perfect knife
        </p>
        <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight mt-3">
          {recommendation.name}
        </h2>
        <p className="text-lg sm:text-xl text-muted-foreground/60 mt-1 font-serif italic">
          {recommendation.japanese}
        </p>
      </div>

      {/* Main recommendation */}
      <div className="rounded border border-primary/20 bg-primary/[0.02] p-6 sm:p-8 mb-4">
        <p className="text-sm sm:text-base leading-relaxed text-foreground/80">
          {recommendation.description}
        </p>
        <div className="mt-5 pt-5 border-t border-primary/10">
          <p className="text-xs tracking-[0.15em] uppercase text-primary font-medium mb-2">
            Why this knife
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {recommendation.why}
          </p>
        </div>
      </div>

      {/* Also consider */}
      {recommendation.alsoConsider && (
        <Link
          href={`/product?category=${recommendation.alsoConsider.slug}`}
          className="flex items-center justify-between rounded border border-border bg-card p-4 sm:p-5 hover:border-border/80 hover:bg-muted/30 transition-colors group mb-8"
        >
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Also consider</p>
            <p className="text-sm font-medium">{recommendation.alsoConsider.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{recommendation.alsoConsider.reason}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-1 transition-all" />
        </Link>
      )}

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <Link
          href={`/product?category=${recommendation.categorySlug}`}
          className="flex-1 flex items-center justify-center gap-2 rounded bg-primary text-primary-foreground px-6 py-3.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Browse {recommendation.name} knives
          <ArrowRight className="size-4" />
        </Link>
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 rounded border border-border bg-card px-6 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        >
          <RotateCcw className="size-3.5" />
          Start over
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   Main Quiz Component
   ========================================================================= */

export function KnifeGuideQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState<KnifeRecommendation | null>(null);

  const currentQuestion = QUESTIONS[step];
  const isLastQuestion = step === QUESTIONS.length - 1;

  const handleSelect = useCallback(
    (optionId: string) => {
      const newAnswers = { ...answers, [currentQuestion.id]: optionId };
      setAnswers(newAnswers);

      // Auto-advance after a brief pause
      setTimeout(() => {
        if (isLastQuestion) {
          setRecommendation(getRecommendation(newAnswers));
          setStep(QUESTIONS.length);
        } else {
          setStep((s) => s + 1);
        }
      }, 300);
    },
    [answers, currentQuestion, isLastQuestion]
  );

  const handleBack = () => {
    if (recommendation) {
      setRecommendation(null);
      setStep(QUESTIONS.length - 1);
    } else if (step > 0) {
      setStep((s) => s - 1);
    }
  };

  const handleReset = () => {
    setStep(0);
    setAnswers({});
    setRecommendation(null);
  };

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-2xl px-5 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 0 && !recommendation}
            className={cn(
              "flex items-center gap-1.5 text-sm transition-colors",
              step === 0 && !recommendation
                ? "text-muted-foreground/30 cursor-default"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {recommendation ? "Result" : `${step + 1} / ${QUESTIONS.length}`}
          </span>
        </div>
        <div className="mx-auto max-w-2xl px-5 sm:px-6 pb-0">
          <ProgressBar current={recommendation ? QUESTIONS.length : step} total={QUESTIONS.length} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center">
        <div className="mx-auto max-w-2xl w-full px-5 sm:px-6 py-10 sm:py-16">
          {recommendation ? (
            <ResultCard recommendation={recommendation} onReset={handleReset} />
          ) : (
            <QuestionCard
              key={step}
              question={currentQuestion}
              onSelect={handleSelect}
              selectedId={answers[currentQuestion.id]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
