import Link from "next/link";

export default function Home() {
  return (
    <main className="container mx-auto py-16 px-4 max-w-4xl">
      <div className="space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            Compound Security Portal
          </h1>
          <p className="text-xl text-gray-500">
            Governance proposal decoder and security tools
          </p>
        </div>

        <div className="flex justify-center gap-4">
          <Link
            href="/decode"
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow hover:bg-gray-800 transition-colors"
          >
            Decode Proposal
          </Link>
          <Link
            href="/simulate"
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow hover:bg-gray-800 transition-colors"
          >
            Simulate Proposal
          </Link>
          <Link
            href="/config"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Settings
          </Link>
        </div>

        <div className="pt-8 border-t border-gray-200">
          <h2 className="text-lg font-semibold mb-4">API Endpoints</h2>
          <div className="flex gap-4 justify-center flex-wrap">
            <div className="text-left bg-gray-100 rounded-lg p-4">
              <code className="text-sm">POST /api/decode</code>
              <p className="text-sm text-gray-500 mt-1">
                Decode a governance proposal
              </p>
            </div>
            <div className="text-left bg-gray-100 rounded-lg p-4">
              <code className="text-sm">POST /api/simulate</code>
              <p className="text-sm text-gray-500 mt-1">
                Simulate a governance proposal
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
