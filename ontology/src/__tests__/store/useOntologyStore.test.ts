import { describe, it, expect, beforeEach } from 'vitest';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

function resetStore() {
  useOntologyStore.setState({
    classes: [],
    instances: [],
    properties: [],
    relationTypes: [],
    edges: [],
    instanceValues: [],
    selectedNodeId: null,
    selectedNodeType: null,
    pendingChanges: [],
    popoverState: null,
    expandedNodes: new Set<string>(),
    focusNodeId: null,
  });
}

describe('useOntologyStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // ─── addClass ─────────────────────────────────────────────
  describe('addClass', () => {
    it('should add a class and return a generated ID', () => {
      const id = useOntologyStore.getState().addClass({ name: 'Animal' });
      const state = useOntologyStore.getState();

      expect(id).toBeDefined();
      expect(state.classes).toHaveLength(1);
      expect(state.classes[0].name).toBe('Animal');
      expect(state.classes[0].id).toBe(id);
    });

    it('should use provided ID if given', () => {
      const id = useOntologyStore.getState().addClass({ id: 'custom-id', name: 'Dog' });
      expect(id).toBe('custom-id');
      expect(useOntologyStore.getState().classes[0].id).toBe('custom-id');
    });

    it('should set default values for optional fields', () => {
      useOntologyStore.getState().addClass({ name: 'Cat' });
      const cls = useOntologyStore.getState().classes[0];

      expect(cls.parentId).toBeNull();
      expect(cls.description).toBe('');
      expect(cls.color).toBe('#7c3aed');
      expect(cls.positionX).toBe(0);
      expect(cls.positionY).toBe(0);
    });

    it('should record a pending ADD change', () => {
      useOntologyStore.getState().addClass({ name: 'Plant' });
      const changes = useOntologyStore.getState().pendingChanges;

      expect(changes).toHaveLength(1);
      expect(changes[0].operation).toBe('ADD');
      expect(changes[0].targetTable).toBe('classes');
      expect(changes[0].targetName).toBe('Plant');
    });

    it('should accumulate multiple classes', () => {
      const store = useOntologyStore.getState();
      store.addClass({ name: 'A' });
      store.addClass({ name: 'B' });
      store.addClass({ name: 'C' });
      expect(useOntologyStore.getState().classes).toHaveLength(3);
    });
  });

  // ─── updateClass ──────────────────────────────────────────
  describe('updateClass', () => {
    it('should update a class name and record MOD change', () => {
      const id = useOntologyStore.getState().addClass({ name: 'OldName' });
      useOntologyStore.getState().updateClass(id, { name: 'NewName' });

      const cls = useOntologyStore.getState().classes[0];
      expect(cls.name).toBe('NewName');

      const modChange = useOntologyStore.getState().pendingChanges.find(
        (c) => c.operation === 'MOD',
      );
      expect(modChange).toBeDefined();
      expect(modChange!.targetName).toBe('NewName');
    });

    it('should update description without changing name', () => {
      const id = useOntologyStore.getState().addClass({ name: 'MyClass' });
      useOntologyStore.getState().updateClass(id, { description: 'Updated desc' });

      expect(useOntologyStore.getState().classes[0].description).toBe('Updated desc');
      expect(useOntologyStore.getState().classes[0].name).toBe('MyClass');
    });
  });

  // ─── removeClass ──────────────────────────────────────────
  describe('removeClass', () => {
    it('should remove a class and record DEL change', () => {
      const id = useOntologyStore.getState().addClass({ name: 'ToDelete' });
      useOntologyStore.getState().removeClass(id);

      expect(useOntologyStore.getState().classes).toHaveLength(0);
      const delChange = useOntologyStore.getState().pendingChanges.find(
        (c) => c.operation === 'DEL',
      );
      expect(delChange).toBeDefined();
      expect(delChange!.targetName).toBe('ToDelete');
    });
  });

  // ─── addProperty ──────────────────────────────────────────
  describe('addProperty', () => {
    it('should add a property with defaults', () => {
      const classId = useOntologyStore.getState().addClass({ name: 'Person' });
      const propId = useOntologyStore.getState().addProperty({
        name: 'age',
        classId,
      });

      const prop = useOntologyStore.getState().properties[0];
      expect(prop.id).toBe(propId);
      expect(prop.name).toBe('age');
      expect(prop.dataType).toBe('string');
      expect(prop.isRequired).toBe(false);
    });

    it('should accept custom dataType', () => {
      const classId = useOntologyStore.getState().addClass({ name: 'Person' });
      useOntologyStore.getState().addProperty({
        name: 'birthDate',
        classId,
        dataType: 'date',
      });

      expect(useOntologyStore.getState().properties[0].dataType).toBe('date');
    });
  });

  // ─── addInstance / removeInstance ──────────────────────────
  describe('addInstance', () => {
    it('should add an instance linked to a class', () => {
      const classId = useOntologyStore.getState().addClass({ name: 'Animal' });
      const instId = useOntologyStore.getState().addInstance({
        name: 'Buddy',
        classId,
      });

      const inst = useOntologyStore.getState().instances[0];
      expect(inst.id).toBe(instId);
      expect(inst.classId).toBe(classId);
      expect(inst.name).toBe('Buddy');
    });
  });

  describe('removeInstance', () => {
    it('should remove instance and its related edges and values', () => {
      const classId = useOntologyStore.getState().addClass({ name: 'Animal' });
      const instId = useOntologyStore.getState().addInstance({ name: 'Buddy', classId });
      const relTypeId = useOntologyStore.getState().addRelationType({ name: 'knows' });
      useOntologyStore.getState().addEdge({
        sourceId: instId,
        targetId: classId,
        relationTypeId: relTypeId,
      });

      useOntologyStore.getState().removeInstance(instId);

      expect(useOntologyStore.getState().instances).toHaveLength(0);
      expect(useOntologyStore.getState().edges).toHaveLength(0);
    });

    it('should clear selection if removed instance was selected', () => {
      const classId = useOntologyStore.getState().addClass({ name: 'A' });
      const instId = useOntologyStore.getState().addInstance({ name: 'I1', classId });
      useOntologyStore.getState().selectNode(instId, 'instance');

      useOntologyStore.getState().removeInstance(instId);

      expect(useOntologyStore.getState().selectedNodeId).toBeNull();
    });
  });

  // ─── addRelationType (PR1: 액션 지향 category) ─────────────
  describe('addRelationType', () => {
    it('defaults category to descriptive and records it in the commit snapshot', () => {
      const id = useOntologyStore.getState().addRelationType({ name: 'relates_to' });
      const state = useOntologyStore.getState();
      const rt = state.relationTypes.find((r) => r.id === id);
      expect(rt?.category).toBe('descriptive');
      // store → Supabase/Neo4j commit snapshot carries category (왕복 1단계).
      const change = state.pendingChanges.find(
        (c) => c.targetTable === 'relation_types' && c.targetId === id,
      );
      expect((change?.afterSnapshot as { category?: string })?.category).toBe('descriptive');
    });

    it('preserves an explicit action-centric category', () => {
      const id = useOntologyStore
        .getState()
        .addRelationType({ name: 'increases', category: 'causal' });
      const rt = useOntologyStore.getState().relationTypes.find((r) => r.id === id);
      expect(rt?.category).toBe('causal');
    });
  });

  // ─── addRelationType / addEdge ────────────────────────────
  describe('addEdge', () => {
    it('should create an edge between two classes', () => {
      const id1 = useOntologyStore.getState().addClass({ name: 'A' });
      const id2 = useOntologyStore.getState().addClass({ name: 'B' });
      const relTypeId = useOntologyStore.getState().addRelationType({ name: 'related_to' });
      const edgeId = useOntologyStore.getState().addEdge({
        sourceId: id1,
        targetId: id2,
        relationTypeId: relTypeId,
      });

      const edge = useOntologyStore.getState().edges[0];
      expect(edge.id).toBe(edgeId);
      expect(edge.sourceId).toBe(id1);
      expect(edge.targetId).toBe(id2);
      expect(edge.relationTypeId).toBe(relTypeId);
    });

    it('should record a pending ADD change for edges', () => {
      const id1 = useOntologyStore.getState().addClass({ name: 'X' });
      const id2 = useOntologyStore.getState().addClass({ name: 'Y' });
      const relTypeId = useOntologyStore.getState().addRelationType({ name: 'has' });
      useOntologyStore.getState().addEdge({
        sourceId: id1,
        targetId: id2,
        relationTypeId: relTypeId,
      });

      const edgeChange = useOntologyStore.getState().pendingChanges.find(
        (c) => c.targetTable === 'edges',
      );
      expect(edgeChange).toBeDefined();
      expect(edgeChange!.targetName).toBe('has');
    });
  });

  // ─── selectNode / clearSelection ──────────────────────────
  describe('selectNode / clearSelection', () => {
    it('should select and clear a node', () => {
      useOntologyStore.getState().selectNode('node-1', 'class');
      expect(useOntologyStore.getState().selectedNodeId).toBe('node-1');
      expect(useOntologyStore.getState().selectedNodeType).toBe('class');

      useOntologyStore.getState().clearSelection();
      expect(useOntologyStore.getState().selectedNodeId).toBeNull();
      expect(useOntologyStore.getState().selectedNodeType).toBeNull();
    });
  });

  // ─── deleteSelectedNode (cascade) ─────────────────────────
  describe('deleteSelectedNode', () => {
    it('should cascade-delete a class with its instances, properties, edges', () => {
      const classId = useOntologyStore.getState().addClass({ name: 'Vehicle' });
      useOntologyStore.getState().addProperty({ name: 'speed', classId });
      const instId = useOntologyStore.getState().addInstance({ name: 'Tesla', classId });
      const relTypeId = useOntologyStore.getState().addRelationType({ name: 'uses' });
      useOntologyStore.getState().addEdge({
        sourceId: classId,
        targetId: instId,
        relationTypeId: relTypeId,
      });

      useOntologyStore.getState().selectNode(classId, 'class');
      useOntologyStore.getState().deleteSelectedNode();

      const state = useOntologyStore.getState();
      expect(state.classes).toHaveLength(0);
      expect(state.properties).toHaveLength(0);
      expect(state.instances).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
      expect(state.selectedNodeId).toBeNull();
    });

    it('should cascade-delete an instance', () => {
      const classId = useOntologyStore.getState().addClass({ name: 'Animal' });
      const instId = useOntologyStore.getState().addInstance({ name: 'Dog', classId });

      useOntologyStore.getState().selectNode(instId, 'instance');
      useOntologyStore.getState().deleteSelectedNode();

      expect(useOntologyStore.getState().instances).toHaveLength(0);
      expect(useOntologyStore.getState().selectedNodeId).toBeNull();
    });

    it('should do nothing if no node is selected', () => {
      useOntologyStore.getState().addClass({ name: 'Survive' });
      useOntologyStore.getState().deleteSelectedNode();

      expect(useOntologyStore.getState().classes).toHaveLength(1);
    });

    it('should reparent child classes to null when parent is deleted', () => {
      const parentId = useOntologyStore.getState().addClass({ name: 'Parent' });
      useOntologyStore.getState().addClass({ name: 'Child', parentId });

      useOntologyStore.getState().selectNode(parentId, 'class');
      useOntologyStore.getState().deleteSelectedNode();

      const child = useOntologyStore.getState().classes[0];
      expect(child.name).toBe('Child');
      expect(child.parentId).toBeNull();
    });
  });

  // ─── pendingChanges / clearChanges ────────────────────────
  describe('pendingChanges', () => {
    it('should accumulate changes and clear them', () => {
      useOntologyStore.getState().addClass({ name: 'A' });
      useOntologyStore.getState().addClass({ name: 'B' });
      expect(useOntologyStore.getState().pendingChanges).toHaveLength(2);

      useOntologyStore.getState().clearChanges();
      expect(useOntologyStore.getState().pendingChanges).toHaveLength(0);
    });
  });

  // ─── popover ──────────────────────────────────────────────
  describe('popover', () => {
    it('should open and close popover', () => {
      useOntologyStore.getState().openPopover({
        type: 'newNode',
        position: { x: 100, y: 200 },
      });
      expect(useOntologyStore.getState().popoverState).toEqual({
        type: 'newNode',
        position: { x: 100, y: 200 },
      });

      useOntologyStore.getState().closePopover();
      expect(useOntologyStore.getState().popoverState).toBeNull();
    });
  });

  // ─── tree expansion ───────────────────────────────────────
  describe('expandedNodes', () => {
    it('should toggle expansion', () => {
      useOntologyStore.getState().toggleExpanded('node-1');
      expect(useOntologyStore.getState().expandedNodes.has('node-1')).toBe(true);

      useOntologyStore.getState().toggleExpanded('node-1');
      expect(useOntologyStore.getState().expandedNodes.has('node-1')).toBe(false);
    });

    it('should set expansion explicitly', () => {
      useOntologyStore.getState().setExpanded('node-2', true);
      expect(useOntologyStore.getState().expandedNodes.has('node-2')).toBe(true);

      useOntologyStore.getState().setExpanded('node-2', false);
      expect(useOntologyStore.getState().expandedNodes.has('node-2')).toBe(false);
    });
  });

  // ─── focus ────────────────────────────────────────────────
  describe('focusNode', () => {
    it('should set and clear focus', () => {
      useOntologyStore.getState().focusNode('node-3');
      expect(useOntologyStore.getState().focusNodeId).toBe('node-3');

      useOntologyStore.getState().clearFocus();
      expect(useOntologyStore.getState().focusNodeId).toBeNull();
    });
  });

  // ─── loadOntology ─────────────────────────────────────────
  describe('loadOntology', () => {
    it('should bulk-load data and reset selection and changes', () => {
      useOntologyStore.getState().addClass({ name: 'Old' });
      useOntologyStore.getState().selectNode('some-id', 'class');

      useOntologyStore.getState().loadOntology({
        classes: [
          {
            id: 'c1',
            parentId: null,
            name: 'Loaded',
            description: '',
            color: '#000',
            positionX: 0,
            positionY: 0,
            createdAt: '',
            updatedAt: '',
          },
        ],
        instances: [],
        properties: [],
        relationTypes: [],
        edges: [],
        instanceValues: [],
      });

      const state = useOntologyStore.getState();
      expect(state.classes).toHaveLength(1);
      expect(state.classes[0].name).toBe('Loaded');
      expect(state.pendingChanges).toHaveLength(0);
      expect(state.selectedNodeId).toBeNull();
    });
  });
});
