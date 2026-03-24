import { Link } from 'wouter';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-sutaeru flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-lg">
        {/* Large 404 */}
        <h1 className="text-8xl sm:text-9xl font-light tracking-tighter text-white/10 mb-4 select-none">
          404
        </h1>

        {/* Subtitle */}
        <h2 className="text-2xl sm:text-3xl font-medium text-white mb-4">
          Page not found
        </h2>

        {/* Message */}
        <p className="text-[#7a7670] mb-10 leading-relaxed">
          The page you're looking for doesn't exist or has been moved. 
          Check the URL or navigate back to the dashboard.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/"
            className="group flex items-center gap-2 px-8 py-4 btn-primary-teal font-medium rounded-full hover:bg-white/90 transition-all duration-300"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-8 py-4 border border-[rgba(255,255,255,0.05)] text-white font-medium rounded-full hover:bg-[rgba(255,255,255,0.04)] hover:border-[#333333] transition-all duration-300"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>

      {/* Footer hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <p className="text-white/20 text-sm">
          Sutaeru — One identity. Every model. For life.
        </p>
      </div>
    </div>
  );
}
