import SmartMoneyDashboard from "../ui/smart-money-dashboard";
import scan from "../../data/smart-money-latest.json";

export const dynamic = "force-static";

export default function SmartMoneyPage() {
  return <SmartMoneyDashboard initialData={scan} />;
}

