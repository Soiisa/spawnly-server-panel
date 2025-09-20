// components/CreditBalance.js
import Link from "next/link";

export default function CreditBalance({ credits = 0 }) {
  const handleCreditsClick = () => {
    console.log("Credits clicked, navigating to /credits");
  };

  return (
    <div className="bg-gray-100 rounded-full p-2 flex items-center justify-between">
      <div className="flex flex-col">
        <p className="text-sm text-neutral-500"></p>
        <Link href="/credits" onClick={handleCreditsClick}>
          <p className="text-xl font-semibold text-indigo-900 hover:text-indigo-700 transition cursor-pointer">
            {credits.toFixed(2)} <span className="text-sm text-neutral-500">credits</span>
          </p>
        </Link>
      </div>
    </div>
  );
}