import { createFileRoute } from "@tanstack/react-router";
import { PublicFloor } from "@/components/floor/public-floor";

export const Route = createFileRoute("/")({ component: PublicFloor });
