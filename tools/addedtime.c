/* Muda a "data de adição" de um arquivo (a que o Finder usa em "Adicionado em"). Só pra testes:
   tools/faxina-teste.sh compila e usa pra criar downloads "esquecidos". */
#include <sys/attr.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "uso: addedtime <unix> <arquivo>...\n"); return 1; }
  time_t t = (time_t)atol(argv[1]);
  for (int i = 2; i < argc; i++) {
    struct attrlist al; memset(&al, 0, sizeof al);
    al.bitmapcount = ATTR_BIT_MAP_COUNT;
    al.commonattr = ATTR_CMN_ADDEDTIME;
    struct timespec ts = { t, 0 };
    if (setattrlist(argv[i], &al, &ts, sizeof ts, FSOPT_NOFOLLOW) != 0) { perror(argv[i]); }
  }
  return 0;
}
