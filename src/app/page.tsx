import Link from "next/link";
import Logo from "@/components/Logo";
import { COMPANY } from "@/lib/memoFormat";
import { currentSession } from "@/lib/currentUser";
import { MODULES, allowedModules } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  const mine = session ? allowedModules(session) : [];
  const cards = MODULES.filter((m) => mine.includes(m.key));

  return (
    <div className="hero">
      <Logo height={96} className="mark" />
      <h1>{COMPANY.name}</h1>
      <p className="tagline">{COMPANY.tagline}</p>

      {cards.length === 0 ? (
        <p className="lead">
          No features have been assigned to your account yet. Ask an admin to
          give you access.
        </p>
      ) : (
        <>
          <p className="lead">Choose what you want to work on.</p>
          <div className="cta">
            {cards.map((m) => (
              <Link key={m.key} href={m.home} className="btn btn-primary">
                {m.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
