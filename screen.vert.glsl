#version 300 es

out vec2 v_uv;

void main() {
    // Generate the quad's corners from the ID, so no attribute buffer is needed.
    ivec2 corner = ivec2(gl_VertexID & 1, gl_VertexID >> 1);
    gl_Position = vec4(vec2(corner) * 2.0 - 1.0, 0.0, 1.0);
    // Texture row 0 is the top QL row, so V runs down the screen.
    v_uv = vec2(corner.x, 1 - corner.y);
}
