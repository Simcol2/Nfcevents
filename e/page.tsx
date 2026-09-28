import ExperienceApp from '@/components/ExperienceApp';

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExperienceApp slug={slug} />;
}
