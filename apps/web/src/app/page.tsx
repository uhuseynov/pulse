import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0d12] text-white">
      <nav className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl">
            ≋
          </div>
          <span className="text-2xl font-bold tracking-tight">
            pulse
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-gray-400 sm:inline">
            Real-time communication
          </span>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-300 hover:text-white"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-500"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <section className="mx-auto flex max-w-6xl flex-col items-center px-6 py-32 text-center">
        <div className="mb-8 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300">
          ✦ A new way to connect
        </div>

        <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-7xl">
          Your people.
          <br />
          Your conversations.
          <br />
          <span className="text-indigo-400">Your Pulse.</span>
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-8 text-gray-400">
          A space where communities come together.
          Chat in real time, join voice rooms, and
          connect through video.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/register"
            className="rounded-xl bg-indigo-600 px-8 py-4 font-semibold transition hover:bg-indigo-500"
          >
            Start Connecting →
          </Link>

          <a
            href="#features"
            className="rounded-xl border border-white/15 px-8 py-4 font-semibold hover:bg-white/5"
          >
            Explore Features
          </a>
        </div>

        <div
          id="features"
          className="mt-24 grid w-full scroll-mt-8 gap-5 text-left md:grid-cols-3"
        >
          <Feature
            icon="💬"
            title="Real-time Chat"
            description="Instant messaging with your communities."
          />

          <Feature
            icon="🎙️"
            title="Voice Rooms"
            description="Join conversations and talk naturally."
          />

          <Feature
            icon="📹"
            title="Video & Sharing"
            description="Connect face-to-face and share your screen."
          />
        </div>
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-gray-500">
        © 2026 Pulse. Connect. Talk. Share.
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-indigo-500/40">
      <div className="mb-5 text-3xl">{icon}</div>
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      <p className="leading-7 text-gray-400">{description}</p>
    </div>
  );
}
