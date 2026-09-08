import { BoardView } from "@/components/kanban/board-view";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoardView boardId={Number(id)} />;
}
