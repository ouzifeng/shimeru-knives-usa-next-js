import type { Metadata } from "next";
import { KnifeGuideQuiz } from "@/components/knife-guide-quiz";

export const metadata: Metadata = {
  title: "Knife Guide — Find Your Perfect Japanese Knife",
  description:
    "Answer a few questions about how you cook and we'll recommend the perfect Japanese kitchen knife for you.",
};

export default function KnifeGuidePage() {
  return <KnifeGuideQuiz />;
}
