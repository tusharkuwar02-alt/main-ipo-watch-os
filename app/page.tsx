import Dashboard from "./ui/dashboard";
import scan from "../data/latest-scan.json";

export const dynamic = "force-static";

export default function Home() {
  return <Dashboard initialData={scan} />;
}
