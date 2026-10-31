import * as THREE from "three";
import type { CollisionWorld, Point } from "./CollisionWorld";

/** Builds open stadium bowls within mapped footprints instead of filling them with a solid roof. */
export class StadiumGenerator {
    /** Shared concrete material for all stadiums in the city. */
    private readonly concrete = new THREE.MeshStandardMaterial({ color: 0xb7b4a8, roughness: 0.92 });
    /** Shared spectator seating material. */
    private readonly seats = new THREE.MeshStandardMaterial({ color: 0x496e85, roughness: 0.8 });
    /** Shared playing field material. */
    private readonly grass = new THREE.MeshStandardMaterial({ color: 0x458542, roughness: 1, side: THREE.DoubleSide });
    /** Shared field marking material. */
    private readonly white = new THREE.LineBasicMaterial({ color: 0xf4f3e9 });
    /** Creates tiered spectator stands around an open playing field with physical perimeter collisions. */
    generate(outer: Point[], tags: Record<string, unknown>, heightAt: (x: number, z: number) => number,
        collisions?: CollisionWorld): THREE.Group {
        const group = new THREE.Group();
        group.name = "Stadium";
        const cx = outer.reduce((sum, p) => sum + p.x, 0) / outer.length;
        const cz = outer.reduce((sum, p) => sum + p.z, 0) / outer.length;
        const base = Math.max(...outer.map(p => heightAt(p.x, p.z))) + 0.08;
        const parsedHeight = parseFloat(String(tags.height ?? ""));
        const height = Number.isFinite(parsedHeight) ? THREE.MathUtils.clamp(parsedHeight, 3, 60) : 12;
        /** Scales the original stadium outline around its centre, retaining its orientation. */
        const ring = (scale: number): Point[] => outer.map(p => ({ x: cx + (p.x - cx) * scale, z: cz + (p.z - cz) * scale }));
        /** Converts a plan ring to the extrusion plane, whose second axis maps to negative Z. */
        const vectors = (points: Point[]): THREE.Vector2[] => points.map(p => new THREE.Vector2(p.x - cx, -(p.z - cz)));
        /** Extrudes one stand ring while leaving the field open. */
        const stand = (innerScale: number, outerScale: number, y: number, depth: number, material: THREE.Material): void => {
            const shape = new THREE.Shape(vectors(ring(outerScale)));
            const hole = vectors(ring(innerScale));
            if (THREE.ShapeUtils.isClockWise(hole) === THREE.ShapeUtils.isClockWise(shape.getPoints())) hole.reverse();
            shape.holes.push(new THREE.Path(hole));
            const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
            geometry.rotateX(-Math.PI / 2); geometry.translate(cx, base + y, cz);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
        };
        stand(0.6, 1, 0, 0.5, this.concrete);
        for (let i = 0; i < 8; i++) {
            const inner = 0.6 + i * 0.045, outside = inner + 0.045;
            stand(inner, outside, 0.5, height * (i + 1) / 8, i % 2 ? this.concrete : this.seats);
            collisions?.addPolygon([ring(outside), ring(inner)], base, base + 0.5 + height * (i + 1) / 8);
        }
        const field = new THREE.ShapeGeometry(new THREE.Shape(vectors(ring(0.595))));
        field.rotateX(-Math.PI / 2); field.translate(cx, base, cz);
        const pitch = new THREE.Mesh(field, this.grass); pitch.receiveShadow = true; group.add(pitch);
        // Align the pitch to the stadium's main axis rather than the world's X/Z axes.
        let xx = 0, zz = 0, xz = 0;
        for (const p of outer) { xx += (p.x-cx)**2; zz += (p.z-cz)**2; xz += (p.x-cx)*(p.z-cz); }
        const angle = 0.5 * Math.atan2(2*xz, xx-zz), cos = Math.cos(angle), sin = Math.sin(angle);
        /** Converts football pitch coordinates (length, width) into the mapped stadium. */
        const point = (u: number, v: number, y = 0.035): THREE.Vector3 =>
            new THREE.Vector3(cx + u*cos - v*sin, base+y, cz + u*sin + v*cos);
        const local = outer.map(p => ({ u:(p.x-cx)*cos+(p.z-cz)*sin, v:-(p.x-cx)*sin+(p.z-cz)*cos }));
        const availableLength = Math.min(Math.max(...local.map(p=>p.u)), -Math.min(...local.map(p=>p.u))) * 1.12;
        const availableWidth = Math.min(Math.max(...local.map(p=>p.v)), -Math.min(...local.map(p=>p.v))) * 1.12;
        let scale = Math.min(availableLength/105, availableWidth/68);
        const opening = ring(0.585);
        /** Tests the pitch perimeter against the actual open bowl, including irregular footprints. */
        const inside = (p: THREE.Vector3): boolean => {
            let hit = false;
            for (let i=0,j=opening.length-1;i<opening.length;j=i++) {
                const a=opening[i]!, b=opening[j]!;
                if ((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) hit=!hit;
            }
            return hit;
        };
        // Fit the corners as well as the sides inside an oval bowl and leave room behind goals.
        for (let attempt=0;attempt<40;attempt++) {
            const fits = [-1,1].every(side => Array.from({length:9},(_,i)=>i/8).every(t =>
                inside(point(side*55*scale,(t*2-1)*34*scale)) &&
                inside(point((t*2-1)*55*scale,side*34*scale))));
            if (fits) break;
            scale *= 0.95;
        }
        const halfLength=52.5*scale, halfWidth=34*scale;
        /** Adds named football markings just above the turf. */
        const line = (name: string, coordinates: number[][]): void => {
            const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(coordinates.map(([u,v,y])=>point(u!,v!,y))), this.white);
            mesh.name=name; group.add(mesh);
        };
        /** Adds a circular marking or an arc in the pitch plane. */
        const arc = (name: string, u: number, v: number, radius: number, from: number, to: number): void => {
            line(name,Array.from({length:49},(_,i)=>[u+Math.cos(from+(to-from)*i/48)*radius,v+Math.sin(from+(to-from)*i/48)*radius]));
        };
        line("Touchlines",[[-halfLength,-halfWidth],[halfLength,-halfWidth],[halfLength,halfWidth],[-halfLength,halfWidth],[-halfLength,-halfWidth]]);
        line("Halfway line",[[0,-halfWidth],[0,halfWidth]]);
        arc("Centre circle",0,0,9.15*scale,0,Math.PI*2);
        arc("Centre spot",0,0,0.18*scale,0,Math.PI*2);
        for (const side of [-1,1]) {
            const goalLine=side*halfLength, penalty=goalLine-side*11*scale;
            for (const [name,depth,width] of [["Penalty area",16.5,40.32],["Goal area",5.5,18.32]] as const)
                line(name,[[goalLine,-width*scale/2],[goalLine-side*depth*scale,-width*scale/2],
                    [goalLine-side*depth*scale,width*scale/2],[goalLine,width*scale/2]]);
            arc("Penalty spot",penalty,0,0.18*scale,0,Math.PI*2);
            const end=Math.acos(5.5/9.15);
            arc("Penalty arc",penalty,0,9.15*scale,side===-1?-end:Math.PI-end,side===-1?end:Math.PI+end);
            for (const edge of [-1,1]) {
                const from=side===-1?(edge===-1?0:-Math.PI/2):(edge===-1?Math.PI/2:Math.PI);
                arc("Corner arc",goalLine,edge*halfWidth,scale,from,from+Math.PI/2);
            }
            const goalHalf=3.66*scale, goalHeight=2.44*scale, back=goalLine+side*2*scale;
            line("Goal frame",[[goalLine,-goalHalf,0],[goalLine,-goalHalf,goalHeight],[goalLine,goalHalf,goalHeight],[goalLine,goalHalf,0]]);
            line("Goal net frame",[[goalLine,-goalHalf,goalHeight],[back,-goalHalf,goalHeight],[back,goalHalf,goalHeight],[goalLine,goalHalf,goalHeight]]);
            for(let i=0;i<=12;i++) {
                const v=-goalHalf+2*goalHalf*i/12;
                line("Goal net",[[goalLine,v,goalHeight],[back,v,goalHeight],[back,v,0]]);
            }
            for(let i=0;i<=5;i++) {
                const y=goalHeight*i/5;
                line("Goal net",[[goalLine,-goalHalf,y],[back,-goalHalf,y],[back,goalHalf,y],[goalLine,goalHalf,y]]);
            }
        }
        return group;
    }

    /** Releases shared materials after all stadium meshes have been removed. */
    dispose(): void {
        this.concrete.dispose(); this.seats.dispose(); this.grass.dispose(); this.white.dispose();
    }
}
