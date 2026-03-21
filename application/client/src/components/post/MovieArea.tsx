import { PausableMovie } from "@web-speed-hackathon-2026/client/src/components/foundation/PausableMovie";
import { getMoviePath, getMoviePosterPath } from "@web-speed-hackathon-2026/client/src/utils/get_path";

interface Props {
  eager?: boolean;
  movie: Models.Movie;
}

export const MovieArea = ({ eager = false, movie }: Props) => {
  return (
    <div
      className="border-cax-border bg-cax-surface-subtle relative h-full w-full overflow-hidden rounded-lg border"
      data-movie-area
    >
      <PausableMovie
        eager={eager}
        posterSrc={getMoviePosterPath(movie.id)}
        src={getMoviePath(movie.id)}
      />
    </div>
  );
};
