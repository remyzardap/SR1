import { Link } from 'wouter';
import { Home, ArrowLeft } from 'lucide-react';
import { LandingMark } from '@/components/LandingMark';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
     <div className="sutaeru-auth-page min-h-dvh bg-sutaeru flex flex-col items-center justify-center px-6 py-12">
      <div className="text-center max-w-lg">
         <LandingMark className="sutaeru-login-mark mx-auto mb-8" />
        {/* Large 404 */}
         <h1 className="text-8xl sm:text-9xl font-light text-muted-foreground/40 mb-4 select-none">
          404
        </h1>

        {/* Subtitle */}
         <h2 className="text-2xl sm:text-3xl font-medium text-foreground mb-4">
          Page not found
        </h2>

        {/* Message */}
         <p className="text-muted-foreground mb-10 leading-relaxed">
          The page you're looking for doesn't exist or has been moved. 
          Check the URL or navigate back to the dashboard.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
           <Button asChild className="min-h-11"><Link href="/">
            <Home className="w-4 h-4" />
             Go Home
           </Link></Button>
           <Button variant="outline"
            onClick={() => window.history.back()}
             className="min-h-11"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
           </Button>
        </div>
      </div>

      {/* Footer hint */}
       <div className="mt-12 text-center">
         <p className="text-muted-foreground text-sm">
          Sutaeru — One identity. Every model. For life.
        </p>
      </div>
    </div>
  );
}
