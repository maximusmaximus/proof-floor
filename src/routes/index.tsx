import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FloorApp } from "@/components/floor/floor-app";
import { PublicFloor } from "@/components/floor/public-floor";
import { PageSkeleton } from "@/components/floor/signed-out";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <PageSkeleton />;
  if (!user) return <PublicFloor />;
  return <FloorApp />;
}