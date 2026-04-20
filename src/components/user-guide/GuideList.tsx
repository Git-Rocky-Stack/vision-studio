interface GuideListProps {
  items: string[];
}

export function GuideList({ items }: GuideListProps) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
