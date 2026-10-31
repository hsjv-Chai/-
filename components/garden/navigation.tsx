import { Sprout, Users } from "lucide-react";
import { appPath } from "@/lib/paths";

export function GardenNavigation({ cooperative }: { cooperative: boolean }) {
  return (
    <nav className="garden-tabs" aria-label="瓜田导航">
      <a
        href={appPath("/garden/")}
        aria-current={!cooperative ? "page" : undefined}
      >
        <Sprout size={18} />
        个人种瓜
      </a>
      <a
        href={appPath("/garden/coops")}
        aria-current={cooperative ? "page" : undefined}
      >
        <Users size={18} />
        社区合种
      </a>
    </nav>
  );
}
