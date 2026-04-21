import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChargesPage } from "@/pages/ChargesPage";

const now = new Date();

const chargeSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.coerce.number().int().default(now.getFullYear()),
});

export const Route = createFileRoute("/_authenticated/charges")({
  validateSearch: zodValidator(chargeSearchSchema),
  component: ChargesPage,
});
