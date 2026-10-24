'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useId, type ReactNode } from 'react';

/**
 * Drag-to-reorder list. Works with mouse, touch and keyboard (focus the handle, Space to lift,
 * arrow keys to move, Space to drop), with screen-reader announcements from dnd-kit.
 */
export function SortableList<T extends { id: string }>({ items, onReorder, render, layout = 'list', label }: {
  items: T[]; onReorder: (next: T[]) => void; render: (item: T, handle: ReactNode, index: number) => ReactNode; layout?: 'list' | 'grid'; label: string;
}) {
  // Stable id so server and client render the same accessibility attributes.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    onReorder(arrayMove(items, from, to));
  }
  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        <ul aria-label={label} className={layout === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'space-y-2'}>
          {items.map((item, i) => <Row key={item.id} id={item.id}>{(handle) => render(item, handle, i)}</Row>)}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Row({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:bg-ivory hover:text-ink active:cursor-grabbing" aria-label="Drag to reorder">
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, opacity: isDragging ? 0.85 : 1 }}>
      {children(handle)}
    </li>
  );
}
