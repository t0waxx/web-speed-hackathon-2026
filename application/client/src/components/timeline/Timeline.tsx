import { TimelineItem } from "@web-speed-hackathon-2026/client/src/components/timeline/TimelineItem";

interface Props {
  timeline: Models.Post[];
}

export const Timeline = ({ timeline }: Props) => {
  return (
    <section>
      {timeline.map((post, index) => {
        // 画面上部に現れやすい先頭数件は動画を優先ロードしてLCP候補の遅延を避ける
        return <TimelineItem eagerMovie={index < 3} key={post.id} post={post} />;
      })}
    </section>
  );
};
