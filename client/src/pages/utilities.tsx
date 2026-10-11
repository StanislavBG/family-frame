import { Route, Switch, useLocation, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SeriesBoard } from "@/components/time-series/series-board";
import { SeriesDetail } from "@/components/time-series/series-detail";
import { useSeriesList } from "@/lib/time-series";

const TAG = "utilities";

function UtilitiesDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ seriesId: string }>("/:seriesId");
  const list = useSeriesList(TAG);
  const seriesId = params?.seriesId ? decodeURIComponent(params.seriesId) : "";
  const series = list.data?.find((s) => s.id === seriesId);

  if (list.isLoading) {
    return <Skeleton className="h-64 w-full" data-testid="utilities-detail-loading" />;
  }
  if (!series) {
    return (
      <div className="space-y-4 text-center py-8" data-testid="utilities-not-found">
        <p className="text-lg">We could not find that bill.</p>
        <Button type="button" variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Utilities
        </Button>
      </div>
    );
  }
  return <SeriesDetail series={series} onBack={() => navigate("/")} />;
}

export default function UtilitiesPage() {
  const [, navigate] = useLocation();
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto" data-testid="page-utilities">
      <Switch>
        <Route path="/">
          <SeriesBoard tag={TAG} title="Utilities" onSelect={(id) => navigate(`/${encodeURIComponent(id)}`)} />
        </Route>
        <Route path="/:seriesId">
          <UtilitiesDetail />
        </Route>
      </Switch>
    </div>
  );
}
