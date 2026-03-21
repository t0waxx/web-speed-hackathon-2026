# docker_image も image_tag も空だと Cloud Run のイメージが決まらないため plan 時に検知する
check "image_reference" {
  assert {
    condition     = trimspace(var.docker_image) != "" || trimspace(var.image_tag) != ""
    error_message = "docker_image（フル参照）か image_tag のどちらかを指定してください。"
  }
}
