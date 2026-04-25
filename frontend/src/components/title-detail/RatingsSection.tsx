import RatingButtons from "../RatingButtons";
import RecommendButton from "../RecommendButton";
import ShareButton from "../ShareButton";
import { Kicker } from "../design";

export interface RatingsSectionProps {
  titleId: string;
  shareTitle: string;
}

export default function RatingsSection({ titleId, shareTitle }: RatingsSectionProps) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="space-y-2">
        <Kicker color="zinc" className="mb-0">
          Your rating
        </Kicker>
        <RatingButtons titleId={titleId} />
      </div>
      <div className="flex-1 min-w-0" />
      <div className="flex items-center gap-2 pt-6">
        <ShareButton title={shareTitle} />
        <RecommendButton titleId={titleId} />
      </div>
    </div>
  );
}
